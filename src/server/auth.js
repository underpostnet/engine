/**
 * Module for managing identity and authorization
 * @module src/server/auth.js
 * @namespace Auth
 */

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { loggerFactory } from './logger.js';
import crypto from 'crypto';
import { promisify } from 'util';
import { UserDto } from '../api/user/user.model.js';
import { commonAdminGuard, commonModeratorGuard, validatePassword } from '../client/components/core/CommonJs.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dotenv.config();
const logger = loggerFactory(import.meta);

// Promisified crypto functions
const pbkdf2 = promisify(crypto.pbkdf2);

// Config with sane defaults and parsing
const config = {
  hashBytes: Number(process.env.PBKDF2_HASH_BYTES) || 32,
  saltBytes: Number(process.env.PBKDF2_SALT_BYTES) || 16,
  iterations: Number(process.env.PBKDF2_ITERATIONS) || 150_000,
  digest: process.env.PBKDF2_DIGEST || 'sha512',
  refreshTokenBytes: Number(process.env.REFRESH_TOKEN_BYTES) || 48,
  jwtAlgorithm: process.env.JWT_ALGORITHM || 'HS512', // consider RS256 with keys
};

const REFRESH_EXPIRE_HOURS = process.env.REFRESH_EXPIRE;
const ACCESS_EXPIRE_HOURS = process.env.EXPIRE;

// ---------- Password hashing (async) ----------
/**
 * Hash password asynchronously using PBKDF2.
 * Stored format: iterations$salt$hash
 * @param {string} password The password to hash.
 * @returns {Promise<string>} The hashed password string.
 * @memberof Auth
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(config.saltBytes).toString('hex');
  const derived = await pbkdf2(password, salt, config.iterations, config.hashBytes, config.digest);
  return `${config.iterations}$${salt}$${derived.toString('hex')}`;
}

/**
 * Verify password using constant-time comparison
 * @param {string} password The password to verify.
 * @param {string} combined The stored hashed password string (iterations$salt$hash).
 * @returns {Promise<boolean>} True if the password is valid, false otherwise.
 * @memberof Auth
 */
async function verifyPassword(password, combined) {
  if (!combined) return false;
  const parts = combined.split('$');
  if (parts.length !== 3) return false;
  const [itersStr, salt, originalHex] = parts;
  const iterations = parseInt(itersStr, 10);
  const derived = await pbkdf2(password, salt, iterations, Buffer.from(originalHex, 'hex').length, config.digest);
  const original = Buffer.from(originalHex, 'hex');
  const ok = crypto.timingSafeEqual(derived, original);
  return ok;
}

// ---------- Token hashing & utilities ----------
/**
 * Hashes a token using SHA256.
 * @param {string} token The token to hash.
 * @returns {string|null} The hashed token as a hex string, or null if token is falsy.
 * @memberof Auth
 */
function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random hex string.
 * @param {number} [bytes=config.refreshTokenBytes] The number of bytes to generate.
 * @returns {string} The random hex string.
 * @memberof Auth
 */
function generateRandomHex(bytes = config.refreshTokenBytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ---------- JWT helpers ----------
/**
 * Signs a JWT payload.
 * @param {object} payload The payload to sign.
 * @param {number} [expireHours=ACCESS_EXPIRE_HOURS] The token expiration in hours.
 * @param {object} [options={}] Additional JWT sign options.
 * @returns {string} The signed JWT.
 * @throws {Error} If JWT key is not configured.
 * @memberof Auth
 */
function jwtSign(payload, expireHours = ACCESS_EXPIRE_HOURS, options = {}) {
  const signOptions = {
    algorithm: config.jwtAlgorithm,
    expiresIn: `${expireHours}h`,
    issuer: process.env.JWT_ISSUER || 'myapp',
    audience: process.env.JWT_AUDIENCE || 'myapp-users',
    ...options,
  };

  if (!payload.jti) signOptions.jwtid = crypto.randomBytes(8).toString('hex');

  const key = config.jwtAlgorithm.startsWith('RS') ? process.env.JWT_PRIVATE_KEY : process.env.JWT_SECRET;
  if (!key) throw new Error('JWT key not configured');
  return jwt.sign(payload, key, signOptions);
}

/**
 * Verifies a JWT.
 * @param {string} token The JWT to verify.
 * @returns {object} The decoded payload.
 * @throws {jwt.JsonWebTokenError} If the token is invalid or expired.
 * @memberof Auth
 */
function jwtVerify(token) {
  try {
    const key = config.jwtAlgorithm.startsWith('RS') ? process.env.JWT_PUBLIC_KEY : process.env.JWT_SECRET;
    return jwt.verify(token, key, {
      algorithms: [config.jwtAlgorithm],
      issuer: process.env.JWT_ISSUER || 'myapp',
      audience: process.env.JWT_AUDIENCE || 'myapp-users',
    });
  } catch (err) {
    throw err;
  }
}

// ---------- Request helpers ----------
/**
 * Extracts the Bearer token from the request headers.
 * @param {import('express').Request} req The Express request object.
 * @returns {string} The token, or an empty string if not found.
 * @memberof Auth
 */
const getBearerToken = (req) => {
  const header = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
};

/**
 * Verifies and returns the JWT payload from the request.
 * @param {import('express').Request} req The Express request object.
 * @returns {object|null} The decoded JWT payload, or null if no token is present.
 * @memberof Auth
 */
const getPayloadJWT = (req) => {
  const token = getBearerToken(req);
  return token ? jwtVerify(token) : null;
};

// ---------- Middleware ----------
/**
 * Express middleware to authenticate requests using a JWT Bearer token.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('express').NextFunction} next The next middleware function.
 * @memberof Auth
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ status: 'error', message: 'unauthorized: token missing' });

    const payload = jwtVerify(token);

    // Validate IP and User-Agent to mitigate token theft
    if (payload.ip && payload.ip !== req.ip) {
      logger.warn(`IP mismatch for ${payload._id}: jwt(${payload.ip}) !== req(${req.ip})`);
      return res.status(401).json({ status: 'error', message: 'unauthorized: ip mismatch' });
    }

    if (payload.userAgent && payload.userAgent !== req.headers['user-agent']) {
      logger.warn(`UA mismatch for ${payload._id}`);
      return res.status(401).json({ status: 'error', message: 'unauthorized: user-agent mismatch' });
    }

    // Optional: verify session exists for non-guest
    if (payload.sessionId && payload.role !== 'guest') {
      const User = DataBaseProvider.instance[`${payload.host}${payload.path}`].mongoose.models.User;
      const user = await User.findOne({ _id: payload._id, 'activeSessions._id': payload.sessionId }).lean();
      if (!user) return res.status(401).json({ status: 'error', message: 'unauthorized: invalid session' });
    }

    req.auth = { user: payload };
    return next();
  } catch (err) {
    logger.warn('authMiddleware error', err && err.message);
    return res.status(401).json({ status: 'error', message: 'unauthorized' });
  }
};

/**
 * Express middleware to guard routes for admin users.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('express').NextFunction} next The next middleware function.
 * @memberof Auth
 */
const adminGuard = (req, res, next) => {
  try {
    if (!req.auth || !commonAdminGuard(req.auth.user.role))
      return res.status(403).json({ status: 'error', message: 'Insufficient permission' });
    return next();
  } catch (err) {
    logger.error(err);
    return res.status(400).json({ status: 'error', message: 'bad request' });
  }
};
/**
 * Express middleware to guard routes for moderator or admin users.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('express').NextFunction} next The next middleware function.
 * @memberof Auth
 */
const moderatorGuard = (req, res, next) => {
  try {
    if (!req.auth || !commonModeratorGuard(req.auth.user.role))
      return res.status(403).json({ status: 'error', message: 'Insufficient permission' });
    return next();
  } catch (err) {
    logger.error(err);
    return res.status(400).json({ status: 'error', message: 'bad request' });
  }
};

// ---------- Password validation middleware (server-side) ----------
/**
 * Validates the password from the request body.
 * @param {import('express').Request} req The Express request object.
 * @returns {{status: 'success'}|{status: 'error', message: string}} Validation result.
 * @memberof Auth
 */
const validatePasswordMiddleware = (req) => {
  const errors = req.body && 'password' in req.body ? validatePassword(req.body.password) : [];
  if (errors.length) {
    return { status: 'error', message: 'Password: ' + errors.map((e) => e[req.lang] || e.en || e).join(', ') };
  }
  return { status: 'success' };
};

// ---------- Session & Refresh token management ----------
/**
 * Create session and set refresh cookie. Rotating and hashed stored token.
 * @param {object} user The user object.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @returns {Promise<{sessionId: string}>} The session ID.
 * @memberof Auth
 */
async function createSessionAndUserToken(user, User, req, res) {
  const refreshToken = generateRandomHex();
  const tokenHash = hashToken(refreshToken);
  const now = Date.now();
  const expiresAt = new Date(now + REFRESH_EXPIRE_HOURS * 60 * 60 * 1000);

  const newSession = {
    tokenHash,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    createdAt: new Date(now),
    expiresAt,
  };

  // push session
  const updatedUser = await User.findByIdAndUpdate(user._id, { $push: { activeSessions: newSession } }, { new: true });
  const session = updatedUser.activeSessions[updatedUser.activeSessions.length - 1];
  const sessionId = session._id.toString();

  // Secure cookie settings
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: REFRESH_EXPIRE_HOURS * 60 * 60 * 1000,
    path: '/',
  });

  return { sessionId };
}

/**
 * Create user and immediate session + access token
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {import('mongoose').Model} File The Mongoose File model.
 * @param {object} [options={}] Additional options.
 * @param {Function} options.getDefaultProfileImageId Function to get the default profile image ID.
 * @returns {Promise<{token: string, user: object}>} The access token and user object.
 * @throws {Error} If password validation fails.
 * @memberof Auth
 */
async function createUserAndSession(req, res, User, File, options = {}) {
  const pwdCheck = validatePasswordMiddleware(req);
  if (pwdCheck.status === 'error') throw new Error(pwdCheck.message);

  req.body.password = await hashPassword(req.body.password);
  req.body.role = req.body.role === 'guest' ? 'guest' : 'user';
  req.body.profileImageId = await options.getDefaultProfileImageId(File);

  const saved = await new User(req.body).save();
  const user = await User.findOne({ _id: saved._id }).select(UserDto.select.get());

  const { sessionId } = await createSessionAndUserToken(user, User, req, res);
  const token = jwtSign(
    UserDto.auth.payload(user, sessionId, req.ip, req.headers['user-agent'], req.hostname, req.path),
  );
  return { token, user };
}

/**
 * Refresh session and rotate refresh token.
 * Detect token reuse: if a refresh token is presented but not found, consider
 * it a possible theft and revoke all sessions for that user.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @returns {Promise<{token: string}>} The new access token.
 * @throws {Error} If the refresh token is missing, invalid, or expired.
 * @memberof Auth
 */
async function refreshSessionAndToken(req, res, User) {
  const raw = req.cookies && req.cookies.refreshToken;
  if (!raw) throw new Error('Refresh token missing');

  const hashed = hashToken(raw);

  // Find user owning that token
  const user = await User.findOne({ 'activeSessions.tokenHash': hashed });

  if (!user) {
    // Possible token reuse: look up user by some other signals? If not possible, log and throw.
    logger.warn('Refresh token reuse or invalid token detected');
    // Optional: revoke by clearing cookie and returning unauthorized
    res.clearCookie('refreshToken', { path: '/' });
    throw new Error('Invalid refresh token');
  }

  // Locate session
  const session = user.activeSessions.find((s) => s.tokenHash === hashed);
  if (!session) {
    // Shouldn't happen, but safe-guard
    res.clearCookie('refreshToken', { path: '/' });
    throw new Error('Session not found');
  }

  // Check expiry
  if (session.expiresAt && session.expiresAt < new Date()) {
    // remove expired session
    user.activeSessions.id(session._id).remove();
    await user.save({ validateBeforeSave: false });
    res.clearCookie('refreshToken', { path: '/' });
    throw new Error('Refresh token expired');
  }

  // Rotate: generate new token, update stored hash and metadata
  const newRaw = generateRandomHex();
  const newHash = hashToken(newRaw);
  session.tokenHash = newHash;
  session.expiresAt = new Date(Date.now() + REFRESH_EXPIRE_HOURS * 60 * 60 * 1000);
  session.ip = req.ip;
  session.userAgent = req.headers['user-agent'];
  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', newRaw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: REFRESH_EXPIRE_HOURS * 60 * 60 * 1000,
    path: '/',
  });

  const accessToken = jwtSign(
    UserDto.auth.payload(user, session._id.toString(), req.ip, req.headers['user-agent'], req.hostname, req.path),
  );
  return { token: accessToken };
}

// ---------- Security middleware composition ----------
/**
 * Applies a set of security-related middleware to an Express app.
 * @param {import('express').Application} app The Express application.
 * @param {object} [opts={}] Options for security middleware.
 * @param {string[]} opts.origin Allowed origins for CORS.
 * @param {object} opts.rate Rate limiting options for `express-rate-limit`.
 * @param {object} opts.slowdown Slow down options for `express-slow-down`.
 * @param {object} opts.cookie Cookie options.
 * @param {string[]} opts.frameAncestors Allowed frame ancestors for CSP.
 * @memberof Auth
 */
function applySecurity(app, opts = {}) {
  const {
    origin,
    rate = { windowMs: 15 * 60 * 1000, max: 100 },
    slowdown = { windowMs: 15 * 60 * 1000, delayAfter: 50, delayMs: () => 500 },
    cookie = { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' },
    frameAncestors = ["'self'"],
  } = opts;

  app.disable('x-powered-by');

  // Basic header hardening with Helmet
  app.use(
    helmet({
      // We'll customize CSP below because many apps need tailored directives
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      originAgentCluster: false,
      // Permissions-Policy (formerly Feature-Policy) — limit powerful features
      permissionsPolicy: {
        // example: disable geolocation, camera, microphone, payment
        features: {
          fullscreen: ["'self'"],
          geolocation: [],
          camera: [],
          microphone: [],
          payment: [],
        },
      },
    }),
  );

  // Strict HSTS (only enable in production over TLS)
  // maxAge in seconds (e.g. 31536000 = 1 year). Use includeSubDomains and preload carefully.
  if (process.env.NODE_ENV === 'production') {
    app.use(
      helmet.hsts({
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }),
    );
  }

  // Other helpful Helmet policies
  app.use(helmet.noSniff()); // X-Content-Type-Options: nosniff
  app.use(helmet.frameguard({ action: 'deny' })); // X-Frame-Options: DENY
  app.use(helmet.referrerPolicy({ policy: 'no-referrer-when-downgrade' }));

  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        blockAllMixedContent: [],
        fontSrc: ["'self'", 'https:', 'data:'],
        frameAncestors: frameAncestors,
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcElem: ["'self'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // try to remove 'unsafe-inline' by using hashes/nonces
      },
    }),
  );

  // CORS - be explicit. Avoid open wildcard in production for credentials.
  app.use(
    cors({
      origin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      maxAge: 600,
    }),
  );

  // Rate limiting + slow down to mitigate brute force and DoS
  const limiter = rateLimit({
    windowMs: rate.windowMs,
    max: rate.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use(limiter);

  const speedLimiter = slowDown({
    windowMs: slowdown.windowMs,
    delayAfter: slowdown.delayAfter,
    delayMs: () => slowdown.delayMs,
  });
  app.use(speedLimiter);

  // Cookie parsing and CSRF protection
  app.use(cookieParser(process.env.JWT_SECRET));
}

export {
  authMiddleware,
  hashPassword,
  verifyPassword,
  hashToken,
  jwtSign,
  jwtVerify,
  jwtSign as hashJWT,
  jwtVerify as verifyJWT,
  adminGuard,
  moderatorGuard,
  validatePasswordMiddleware,
  getBearerToken,
  getPayloadJWT,
  createSessionAndUserToken,
  createUserAndSession,
  refreshSessionAndToken,
  applySecurity,
};
