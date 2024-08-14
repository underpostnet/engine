import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { loggerFactory } from './logger.js';
import crypto from 'crypto';
import { userRoleEnum } from '../api/user/user.model.js';

dotenv.config();

const logger = loggerFactory(import.meta);

// password

// larger numbers mean better security
const config = {
  // size of the generated hash
  hashBytes: 32,
  // larger salt means hashed passwords are more resistant to rainbow table, but
  // you get diminishing returns pretty fast
  saltBytes: 16,
  // more iterations means an attacker has to take longer to brute force an
  // individual password, so larger is better. however, larger also means longer
  // to hash the password. tune so that hashing the password takes about a
  // second
  iterations: 872791,
  digest: 'sha512',
};

/**
 * @param {String} password - given password to hash
 * @returns {String} the hash corresponding to the password
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
 */
function verifyPassword(password, combined) {
  const { iterations, hashBytes, digest } = config;
  const [salt, originalHash] = combined.split('$');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, hashBytes, digest).toString('hex');
  return hash === originalHash;
}

// jwt middleware

/**
 * The hashJWT function generates a JSON Web Token (JWT) using the provided payload and environment
 * variables for the secret and expiration time.
 * @param payload - The `payload` parameter in the `hashJWT` function typically refers to the data that
 * you want to encode into the JSON Web Token (JWT). This data can be any JSON object that you want to
 * securely transmit or store. It could include user information, permissions, or any other relevant
 * data that
 * @returns {String} the jwt hash corresponding to the payload
 */
const hashJWT = (payload) => jwt.sign(payload, process.env.SECRET, { expiresIn: `${process.env.EXPIRE}h` });

/**
 * The function `verifyJWT` is used to verify a JSON Web Token (JWT) using a secret key stored in the
 * environment variables.
 * @param [token] - The `token` parameter is a JSON Web Token (JWT) that is passed to the `verifyJWT`
 * function for verification.
 */
const verifyJWT = (token = '') => jwt.verify(token, process.env.SECRET);

/**
 * The function `verifyPayloadExpireJWT` checks if a given payload object has a valid expiration time
 * in milliseconds.
 * @param [payload] - The `payload` parameter is expected to be an object with a numeric property `exp`
 * representing a timestamp. The function `verifyPayloadExpireJWT` checks if the `exp` property is a
 * number and if it represents a timestamp in the future (after the current time).
 */
const verifyPayloadExpireJWT = (payload = {}) =>
  typeof payload === 'object' && typeof payload.exp === 'number' && payload.exp * 1000 > +new Date();

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
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7, authHeader.length);
      const payload = verifyJWT(token);
      const validExpireJWT = verifyPayloadExpireJWT(payload);
      if (validExpireJWT !== true)
        return res.status(401).json({
          status: 'error',
          message: 'unauthorized: expire token',
        });
      req.auth = payload;
      return next();
    }
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
 */
const adminGuard = (req, res, next) => {
  try {
    if (!(userRoleEnum.indexOf(req.auth.user.role) === userRoleEnum.indexOf('admin')))
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
 */
const moderatorGuard = (req, res, next) => {
  try {
    if (!(userRoleEnum.indexOf(req.auth.user.role) <= userRoleEnum.indexOf('moderator')))
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

export {
  authMiddleware,
  hashPassword,
  verifyPassword,
  hashJWT,
  adminGuard,
  moderatorGuard,
  verifyPayloadExpireJWT,
  verifyJWT,
};
