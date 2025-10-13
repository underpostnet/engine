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
import { DataBaseProvider } from '../db/DataBaseProvider.js';

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

/**
 * Generates a JWT issuer and audience based on the host and path.
 * @param {object} options The options object.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {object} The issuer and audience.
 * @memberof Auth
 */
function jwtIssuerAudienceFactory(options = { host: '', path: '' }) {
  const audience = `${options.host}${options.path === '/' ? '' : options.path}`;
  const issuer = `${audience}/api`;
  return { issuer, audience };
}

// ---------- JWT helpers ----------
/**
 * Signs a JWT payload.
 * @param {object} payload The payload to sign.
 * @param {object} [options={}] Additional JWT sign options.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @param {number} accessExpireMinutes The access token expiration in minutes.
 * @param {number} refreshExpireMinutes The refresh token expiration in minutes.
 * @returns {string} The signed JWT.
 * @throws {Error} If JWT key is not configured.
 * @memberof Auth
 */
function jwtSign(
  payload,
  options = { host: '', path: '' },
  accessExpireMinutes = process.env.ACCESS_EXPIRE_MINUTES,
  refreshExpireMinutes = process.env.REFRESH_EXPIRE_MINUTES,
) {
  const { issuer, audience } = jwtIssuerAudienceFactory(options);
  const signOptions = {
    algorithm: config.jwtAlgorithm,
    expiresIn: `${accessExpireMinutes}m`,
    issuer,
    audience,
  };

  if (!payload.jwtid) signOptions.jwtid = generateRandomHex();

  if (!process.env.JWT_SECRET) throw new Error('JWT key not configured');

  // Add refreshExpiresAt to the payload, which is the same as the token's own expiry.
  const now = Date.now();
  payload.refreshExpiresAt = now + refreshExpireMinutes * 60 * 1000;

  logger.info('JWT signed', { payload, signOptions, accessExpireMinutes, refreshExpireMinutes });

  return jwt.sign(payload, process.env.JWT_SECRET, signOptions);
}

/**
 * Verifies a JWT.
 * @param {string} token The JWT to verify.
 * @param {object} [options={}] Additional JWT verify options.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {object} The decoded payload.
 * @throws {jwt.JsonWebTokenError} If the token is invalid or expired.
 * @memberof Auth
 */
function jwtVerify(token, options = { host: '', path: '' }) {
  try {
    const { issuer, audience } = jwtIssuerAudienceFactory(options);
    const verifyOptions = {
      algorithms: [config.jwtAlgorithm],
      issuer,
      audience,
    };
    return jwt.verify(token, process.env.JWT_SECRET, verifyOptions);
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
 * Checks if the request is a refresh token request.
 * @param {import('express').Request} req The Express request object.
 * @returns {boolean} True if the request is a refresh token request, false otherwise.
 * @memberof Auth
 */
const isRefreshTokenReq = (req) => req.method === 'GET' && req.params.id === 'auth';

// ---------- Middleware ----------
/**
 * Creates a middleware to authenticate requests using a JWT Bearer token.
 * @param {object} options The options object.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {function} The middleware function.
 * @memberof Auth
 */
const authMiddlewareFactory = (options = { host: '', path: '' }) => {
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

      const payload = jwtVerify(token, options);

      // Validate IP and User-Agent to mitigate token theft
      if (payload.ip && payload.ip !== req.ip) {
        logger.warn(`IP mismatch for ${payload._id}: jwt(${payload.ip}) !== req(${req.ip})`);
        return res.status(401).json({ status: 'error', message: 'unauthorized: ip mismatch' });
      }

      if (payload.userAgent && payload.userAgent !== req.headers['user-agent']) {
        logger.warn(`UA mismatch for ${payload._id}`);
        return res.status(401).json({ status: 'error', message: 'unauthorized: user-agent mismatch' });
      }

      // Non-guest verify session exists
      if (payload.jwtid && payload.role !== 'guest') {
        const User = DataBaseProvider.instance[`${payload.host}${payload.path}`].mongoose.models.User;
        const user = await User.findOne({ _id: payload._id, 'activeSessions._id': payload.jwtid }).lean();

        if (!user) {
          return res.status(401).json({ status: 'error', message: 'unauthorized: invalid session' });
        }
        const session = user.activeSessions.find((s) => s._id.toString() === payload.jwtid);

        if (!session) {
          return res.status(401).json({ status: 'error', message: 'unauthorized: invalid session' });
        }

        // check session ip
        if (session.ip !== req.ip) {
          logger.warn(`IP mismatch for ${payload._id}: jwt(${session.ip}) !== req(${req.ip})`);
          return res.status(401).json({ status: 'error', message: 'unauthorized: ip mismatch' });
        }

        // check session userAgent
        if (session.userAgent !== req.headers['user-agent']) {
          logger.warn(`UA mismatch for ${payload._id}`);
          return res.status(401).json({ status: 'error', message: 'unauthorized: user-agent mismatch' });
        }

        // compare payload host and path with session host and path
        if (payload.host !== session.host || payload.path !== session.path) {
          logger.warn(`Host or path mismatch for ${payload._id}`);
          return res.status(401).json({ status: 'error', message: 'unauthorized: host or path mismatch' });
        }

        if (!isRefreshTokenReq(req) && session.expiresAt < new Date()) {
          return res.status(401).json({ status: 'error', message: 'unauthorized: session expired' });
        }
      }

      req.auth = { user: payload };
      return next();
    } catch (err) {
      logger.warn('authMiddleware error', err && err.message);
      return res.status(401).json({ status: 'error', message: 'unauthorized' });
    }
  };
  return authMiddleware;
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
 * Creates cookie options for the refresh token.
 * @param {import('express').Request} req The Express request object.
 * @param {string} host The host name.
 * @returns {object} Cookie options.
 * @memberof Auth
 */
const cookieOptionsFactory = (req, host) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Determine if request is secure: respect X-Forwarded-Proto when behind proxy
  const forwardedProto = (req.headers && req.headers['x-forwarded-proto']) || '';
  const reqIsSecure = Boolean(req.secure || forwardedProto.split(',')[0] === 'https');

  // secure must be true for SameSite=None to work across sites
  const secure = isProduction ? reqIsSecure : req.protocol === 'https';
  const sameSite = secure ? 'None' : 'Lax';

  // Safe parse of maxAge minutes
  const maxAge = parseInt(process.env.ACCESS_EXPIRE_MINUTES) * 60 * 1000;

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? host : 'localhost',
    maxAge,
  };

  return opts;
};

/**
 * Create session and set refresh cookie. Rotating and hashed stored token.
 * @param {object} user The user object.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {object} options Additional options.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {Promise<{jwtid: string}>} The session ID.
 * @memberof Auth
 */
async function createSessionAndUserToken(user, User, req, res, options = { host: '', path: '' }) {
  const refreshToken = hashToken(generateRandomHex());
  const now = Date.now();
  const expiresAt = new Date(now + parseInt(process.env.REFRESH_EXPIRE_MINUTES) * 60 * 1000);

  const newSession = {
    tokenHash: refreshToken,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    host: options.host,
    path: options.path,
    createdAt: new Date(now),
    expiresAt,
  };

  // push session
  const updatedUser = await User.findByIdAndUpdate(user._id, { $push: { activeSessions: newSession } }, { new: true });
  const session = updatedUser.activeSessions[updatedUser.activeSessions.length - 1];
  const jwtid = session._id.toString();

  // Secure cookie settings
  res.cookie('refreshToken', refreshToken, cookieOptionsFactory(req, options.host));

  return { jwtid };
}

/**
 * Removes a session by its ID for a given user.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {string} userId The ID of the user.
 * @param {string} sessionId The ID of the session to remove.
 * @returns {Promise<void>}
 * @memberof Auth
 */
async function removeSession(User, userId, sessionId) {
  return await User.updateOne({ _id: userId }, { $pull: { activeSessions: { _id: sessionId } } });
}

/**
 * Logs out a user session by removing it from the database and clearing the refresh token cookie.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @returns {Promise<boolean>} True if a session was found and removed, false otherwise.
 * @memberof Auth
 */
async function logoutSession(User, req, res) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return false;
  }

  const user = await User.findOne({ 'activeSessions.tokenHash': refreshToken });

  if (!user) {
    return false;
  }

  const session = user.activeSessions.find((s) => s.tokenHash === refreshToken);

  const result = await removeSession(User, user._id, session._id);

  res.clearCookie('refreshToken', { path: '/' });

  return result.modifiedCount > 0;
}

/**
 * Create user and immediate session + access token
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('mongoose').Model} User The Mongoose User model.
 * @param {import('mongoose').Model} File The Mongoose File model.
 * @param {object} [options={}] Additional options.
 * @param {Function} options.getDefaultProfileImageId Function to get the default profile image ID.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {Promise<{token: string, user: object}>} The access token and user object.
 * @throws {Error} If password validation fails.
 * @memberof Auth
 */
async function createUserAndSession(req, res, User, File, options = { host: '', path: '' }) {
  const pwdCheck = validatePasswordMiddleware(req);
  if (pwdCheck.status === 'error') throw new Error(pwdCheck.message);

  req.body.password = await hashPassword(req.body.password);
  req.body.role = req.body.role === 'guest' ? 'guest' : 'user';
  req.body.profileImageId = await options.getDefaultProfileImageId(File);

  const saved = await new User(req.body).save();
  const user = await User.findOne({ _id: saved._id }).select(UserDto.select.get());

  const { jwtid } = await createSessionAndUserToken(user, User, req, res, options);
  const token = jwtSign(
    UserDto.auth.payload(user, jwtid, req.ip, req.headers['user-agent'], options.host, options.path),
    options,
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
 * @param {object} options Additional options.
 * @param {string} options.host The host name.
 * @param {string} options.path The path name.
 * @returns {Promise<{token: string}>} The new access token.
 * @throws {Error} If the refresh token is missing, invalid, or expired.
 * @memberof Auth
 */
async function refreshSessionAndToken(req, res, User, options = { host: '', path: '' }) {
  const currentRefreshToken = req.cookies.refreshToken;
  if (!currentRefreshToken) throw new Error('Refresh token missing');

  // Find user owning that token
  const user = await User.findOne({ 'activeSessions.tokenHash': currentRefreshToken });

  if (!user) {
    // Possible token reuse: look up user by some other signals? If not possible, log and throw.
    // TODO: on cors requests, this will throw an error, because the cookie is not sent.
    logger.warn('Refresh token reuse or invalid token detected');
    // Optional: revoke by clearing cookie and returning unauthorized
    res.clearCookie('refreshToken', { path: '/' });
    throw new Error('Invalid refresh token');
  }

  // Locate session
  const session = user.activeSessions.find((s) => s.tokenHash === currentRefreshToken);
  if (!session) {
    // Shouldn't happen, but safe-guard
    res.clearCookie('refreshToken', { path: '/' });
    throw new Error('Session not found');
  }

  // Check expiry
  if (!isRefreshTokenReq(req) && session.expiresAt && session.expiresAt < new Date()) {
    const result = await removeSession(User, user._id, session._id);
    if (result) throw new Error('Refresh token expired');
    else throw new Error('Session not found');
  }

  // Rotate: generate new token, update stored hash and metadata
  const refreshToken = hashToken(generateRandomHex());
  session.tokenHash = refreshToken;
  session.expiresAt = new Date(Date.now() + parseInt(process.env.REFRESH_EXPIRE_MINUTES) * 60 * 1000);
  session.ip = req.ip;
  session.userAgent = req.headers['user-agent'];
  await user.save({ validateBeforeSave: false });

  logger.warn('Refreshed session for user ' + user.email);

  res.cookie('refreshToken', refreshToken, cookieOptionsFactory(req, options.host));

  return jwtSign(
    UserDto.auth.payload(user, session._id.toString(), req.ip, req.headers['user-agent'], options.host, options.path),
    options,
  );
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
    rate = { windowMs: 15 * 60 * 1000, max: 500 },
    slowdown = { windowMs: 15 * 60 * 1000, delayAfter: 50, delayMs: () => 500 },
    cookie = { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' },
    frameAncestors = ["'self'"],
  } = opts;

  app.disable('x-powered-by');

  // Generate nonce per request and attach to res.locals for templates
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

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

  // Content-Security-Policy: include nonce from res.locals
  // Note: We avoid 'unsafe-inline' on script/style. Use nonces or hashes.
  const httpDirective = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
  app.use(
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        blockAllMixedContent: [],
        fontSrc: ["'self'", httpDirective, 'data:'],
        frameAncestors: frameAncestors,
        imgSrc: ["'self'", 'data:', httpDirective, 'https:', 'blob:'],
        objectSrc: ["'none'"],
        // script-src and script-src-elem include dynamic nonce
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          (req, res) => (res.locals.isSwagger ? "'unsafe-inline'" : ''),
        ],
        scriptSrcElem: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        // style-src: avoid 'unsafe-inline' when possible; if you must inline styles,
        // use a nonce for them too (or hash).
        styleSrc: [
          "'self'",
          httpDirective,
          (req, res) => (res.locals.isSwagger ? "'unsafe-inline'" : `'nonce-${res.locals.nonce}'`),
        ],
        // deny plugins
        objectSrc: ["'none'"],
      },
    }),
  );

  // CORS - be explicit. In production, pass allowed origin(s) as opts.origin
  app.use(
    cors({
      origin: origin || false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'withcredentials', 'credentials'],
      maxAge: 600,
    }),
  );
  logger.info('Cors origin', origin);

  // Rate limiting + slow down
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

  // Cookie parsing
  app.use(cookieParser(process.env.JWT_SECRET));
}

export {
  authMiddlewareFactory,
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
  createSessionAndUserToken,
  createUserAndSession,
  refreshSessionAndToken,
  logoutSession,
  removeSession,
  applySecurity,
  isRefreshTokenReq,
};
