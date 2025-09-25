/**
 * Module for managing identity and authorization
 * @module src/server/auth.js
 * @namespace Auth
 */

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { loggerFactory } from './logger.js';
import crypto from 'crypto';
import { UserDto, userRoleEnum } from '../api/user/user.model.js';
import { commonAdminGuard, commonModeratorGuard, validatePassword } from '../client/components/core/CommonJs.js';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dotenv.config();

const logger = loggerFactory(import.meta);

/* The `const config` object is defining parameters related to the hashing process used for password
security. Here's a breakdown of each property in the `config` object: */
const config = {
  hashBytes: 32,
  saltBytes: 16,
  iterations: 872791,
  digest: 'sha512',
};

/**
 * @param {String} password - given password to hash
 * @returns {String} the hash corresponding to the password
 * @memberof Auth
 */
function hashPassword(password) {
  const { iterations, hashBytes, digest, saltBytes } = config;
  const salt = crypto.randomBytes(saltBytes).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, hashBytes, digest).toString('hex');
  return [salt, hash].join('$');
}

/**
 * @param {String} password - password to verify
 * @param {String} combined - a combined salt + hash returned by hashPassword function
 * @returns {Boolean} true if password correspond to the hash. False otherwise
 * @memberof Auth
 */
function verifyPassword(password, combined) {
  const { iterations, hashBytes, digest } = config;
  const [salt, originalHash] = combined.split('$');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, hashBytes, digest).toString('hex');
  return hash === originalHash;
}

/**
 * @param {String} token - token to hash
 * @returns {String} the sha256 hash of the token
 * @memberof Auth
 */
function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

// jwt middleware

/**
 * The hashJWT function generates a JSON Web Token (JWT) with a specified payload and expiration time.
 * @param payload - The `payload` parameter in the `hashJWT` function is the data that you want to
 * encode into the JSON Web Token (JWT). It typically contains information about the user or any other
 * relevant data that you want to securely transmit.
 * @param expire - The `expire` parameter in the `hashJWT` function is used to specify the expiration
 * time for the JSON Web Token (JWT) being generated. If a value is provided for `expire`, it will be
 * used as the expiration time. If `expire` is not provided (i.e., it
 * @memberof Auth
 */
const hashJWT = (payload, expire) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expire !== undefined ? expire : `${process.env.EXPIRE}h`,
  });

/**
 * The function `verifyJWT` is used to verify a JSON Web Token (JWT) using a secret key stored in the
 * environment variables.
 * @param token - The `token` parameter is a JSON Web Token (JWT) that is passed to the `verifyJWT`
 * function for verification.
 * @memberof Auth
 */
const verifyJWT = (token = '') => jwt.verify(token, process.env.JWT_SECRET);

/**
 * The function `getBearerToken` extracts and returns the Bearer token from the Authorization header in
 * a request object.
 * @param req - The `req` parameter in the `getBearerToken` function is typically an object
 * representing the HTTP request. It is commonly used in Node.js applications with frameworks like
 * Express.js. The `req` object contains information about the incoming HTTP request, including
 * headers, body, parameters, and more. In
 * @returns {String} The function `getBearerToken` is returning the Bearer token extracted from the
 * Authorization header in the request object. If the Authorization header starts with 'Bearer ', it
 * will return the token portion of the header (excluding 'Bearer ').
 * @memberof Auth
 */
const getBearerToken = (req) => {
  const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7, authHeader.length);
  return '';
};

/**
 * The function `getPayloadJWT` extracts and verifies a JWT payload from a request using a bearer
 * token.
 * @param req - The `req` parameter is typically used in web development to represent the HTTP request
 * object. It contains information about the incoming request, such as headers, parameters, and body
 * data. In this context, it seems like the `getPayloadJWT` function is designed to extract and verify
 * a JWT token from
 * @returns {Object} The JWT payload from a request using a bearer
 * @memberof Auth
 */
const getPayloadJWT = (req) => verifyJWT(getBearerToken(req));

/**
 * The authMiddleware function checks and verifies the authorization token in the request headers
 * before allowing access to protected routes.
 * @param req - The `req` parameter in the `authMiddleware` function stands for the request object. It
 * contains information about the HTTP request made to the server, including headers, body, parameters,
 * and more. In this context, the function is extracting the authorization token from the request
 * headers to authenticate the user.
 * @param res - The `res` parameter in the `authMiddleware` function is the response object that
 * represents the HTTP response that an Express.js server sends when it receives an HTTP request. It is
 * used to send a response back to the client with status codes, headers, and data.
 * @param next - The `next` parameter in the `authMiddleware` function is a callback function that is
 * used to pass control to the next middleware function in the stack. When called, it invokes the next
 * middleware function in the chain. This is a common pattern in Express.js middleware functions to
 * move to the next middleware
 * @returns {Object} The `req.auth` included JWT payload in request authorization
 * @memberof Auth
 */
const authMiddleware = (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (token) {
      const payload = verifyJWT(token);

      // Security enhancement: Validate IP and User-Agent
      if (
        payload &&
        payload.role !== 'guest' &&
        (payload.ip !== req.ip || payload.userAgent !== req.headers['user-agent'])
      ) {
        logger.warn(
          `JWT validation failed for user ${payload._id}: IP or User-Agent mismatch. ` +
            `JWT IP: ${payload.ip}, Request IP: ${req.ip}. ` +
            `JWT UA: ${payload.userAgent}, Request UA: ${req.headers['user-agent']}`,
        );
        return res.status(401).json({
          status: 'error',
          message: 'unauthorized: invalid token credentials',
        });
      }
      req.auth = { user: payload };
      return next();
    } else
      return res.status(401).json({
        status: 'error',
        message: 'unauthorized: invalid token',
      });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * The `adminGuard` function checks if the user has admin role permission and returns an error message
 * if not.
 * @param req - The `req` parameter typically represents the HTTP request object in Node.js. It
 * contains information about the incoming request such as the request headers, parameters, body, and
 * more. In the context of your `adminGuard` function, `req` is the request object that is being passed
 * to the middleware
 * @param res - The `res` parameter in the `adminGuard` function is the response object in Express.js.
 * It is used to send a response back to the client making the HTTP request.
 * @param next - The `next` parameter in the `adminGuard` function is a callback function that is used
 * to pass control to the next middleware function in the stack. When called, it executes the next
 * middleware function. If there are no more middleware functions in the stack, it will proceed to the
 * route handler.
 * @returns The `adminGuard` function is returning either a 403 status with an error message if the
 * user role is not 'admin', or it is calling the `next()` function to proceed to the next middleware
 * if the user role is 'admin'. If an error occurs during the process, it will log the error and return
 * a 400 status with the error message.
 * @memberof Auth
 */
const adminGuard = (req, res, next) => {
  try {
    if (!commonAdminGuard(req.auth.user.role))
      return res.status(403).json({ status: 'error', message: 'Insufficient permission' });
    return next();
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * The function `moderatorGuard` checks if the user's role is at least a moderator and handles errors
 * accordingly.
 * @param req - The `req` parameter in the `moderatorGuard` function typically represents the HTTP
 * request object, which contains information about the incoming request such as headers, parameters,
 * body, etc. It is commonly used to access data sent from the client to the server.
 * @param res - The `res` parameter in the `moderatorGuard` function is the response object in
 * Express.js. It is used to send a response back to the client making the HTTP request.
 * @param next - The `next` parameter in the `moderatorGuard` function is a callback function that is
 * used to pass control to the next middleware function in the stack. When called, it will execute the
 * next middleware function. In the context of Express.js middleware, `next` is typically called to
 * move to
 * @returns In the `moderatorGuard` function, if the user's role is not a moderator or higher, a 403
 * status with an error message "Insufficient permission" is returned. If there is an error during the
 * process, a 400 status with the error message is returned. If everything is successful, the `next()`
 * function is called to proceed to the next middleware in the chain.
 * @memberof Auth
 */
const moderatorGuard = (req, res, next) => {
  try {
    if (!commonModeratorGuard(req.auth.user.role))
      return res.status(403).json({ status: 'error', message: 'Insufficient permission' });
    return next();
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

const validatePasswordMiddleware = (req, password) => {
  let errors = [];
  if (req.body && 'password' in req.body) errors = validatePassword(req.body.password);
  if (errors.length > 0)
    return {
      status: 'error',
      message:
        'Password, ' + errors.map((e, i) => (i > 0 ? ', ' : '') + (e[req.lang] ? e[req.lang] : e['en'])).join(''),
    };
  else
    return {
      status: 'success',
    };
};

/**
 * Creates a new user session, saves it, and sets the refresh token cookie.
 * @param {import('../api/user/user.model.js').UserModel} user - The user mongoose instance.
 * @param {import('../api/user/user.model.js').UserModel} User - The user mongoose model.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<{sessionId: string}>} The session ID.
 * @memberof Auth
 */
async function createSessionAndUserToken(user, User, req, res) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const newSession = {
    tokenHash: hashToken(refreshToken),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    expiresAt: new Date(Date.now() + process.env.REFRESH_EXPIRE * 60 * 60 * 1000),
  };
  if (!user.activeSessions) {
    user.activeSessions = [];
    user._doc.activeSessions = [];
  }
  const updatedUser = await User.findByIdAndUpdate(user._id, { $push: { activeSessions: newSession } }, { new: true });

  const sessionId = updatedUser.activeSessions[updatedUser.activeSessions.length - 1]._id.toString();

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: process.env.REFRESH_EXPIRE * 60 * 60 * 1000,
  });

  return { sessionId };
}

/**
 * Creates a new user, saves it, and returns a JWT and user data.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('../api/user/user.model.js').UserModel} User - The Mongoose User model.
 * @param {import('../api/file/file.model.js').FileModel} File - The Mongoose File model.
 * @param {Object} options - Service options.
 * @returns {Promise<{token: string, user: object}>} The JWT and user object.
 * @memberof Auth
 */
async function createUserAndSession(req, res, User, File, options) {
  const validatePassword = validatePasswordMiddleware(req);
  if (validatePassword.status === 'error') throw new Error(validatePassword.message);

  req.body.password = await hashPassword(req.body.password);
  req.body.role = req.body.role === 'guest' ? 'guest' : 'user';
  req.body.profileImageId = await options.getDefaultProfileImageId(File);

  const { _id } = await new User(req.body).save();

  if (_id) {
    const user = await User.findOne({ _id }).select(UserDto.select.get());
    const { sessionId } = await createSessionAndUserToken(user, User, req, res);
    return {
      token: hashJWT(UserDto.auth.payload(user, sessionId, req.ip, req.headers['user-agent'])),
      user,
    };
  }

  throw new Error('failed to create user');
}

/**
 * Refreshes a user session using a refresh token, rotates the token, and issues a new access token.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('../api/user/user.model.js').UserModel} User - The Mongoose User model.
 * @returns {Promise<{token: string}>} A new access token.
 * @memberof Auth
 */
async function refreshSessionAndToken(req, res, User) {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) throw new Error('Refresh token missing');

  const hashedToken = hashToken(refreshToken);

  const user = await User.findOne({ 'activeSessions.tokenHash': hashedToken });

  if (!user) {
    throw new Error('Invalid refresh token');
  }

  const session = user.activeSessions.find((s) => s.tokenHash === hashedToken);

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      user.activeSessions.pull({ _id: session._id });
      await user.save({ validateBeforeSave: false });
    }
    throw new Error('Refresh token expired or invalid');
  }

  // Rotate token
  const newRefreshToken = crypto.randomBytes(48).toString('hex');
  session.tokenHash = hashToken(newRefreshToken);
  session.expiresAt = new Date(Date.now() + process.env.REFRESH_EXPIRE * 60 * 60 * 1000);
  session.ip = req.ip;
  session.userAgent = req.headers['user-agent'];

  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: process.env.REFRESH_EXPIRE * 60 * 60 * 1000,
  });

  const accessToken = hashJWT(UserDto.auth.payload(user, session._id.toString(), req.ip, req.headers['user-agent']));
  return { token: accessToken };
}

/**
 * applySecurity(app, opts)
 * - app: express() instance
 * - opts: {
 *     origin: string|array,  // allowed CORS origin(s)
 *     rate: { windowMs, max },
 *     slowDown: { windowMs, delayAfter, delayMs },
 *     cookie: { secret, secure, sameSite }
 *   }
 */
export function applySecurity(app, opts = {}) {
  const {
    origin,
    rate = { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15min by default
    slowdown = { windowMs: 15 * 60 * 1000, delayAfter: 50, delayMs: 500 },
    cookie = { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' },
    frameAncestors = ["'self'"],
  } = opts;

  // Remove/disable identifying headers
  app.disable('x-powered-by'); // don't reveal Express

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
  hashJWT,
  adminGuard,
  moderatorGuard,
  verifyJWT,
  validatePasswordMiddleware,
  getBearerToken,
  getPayloadJWT,
  createSessionAndUserToken,
  createUserAndSession,
  refreshSessionAndToken,
};
