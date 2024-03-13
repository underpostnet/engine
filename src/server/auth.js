import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loggerFactory } from './logger.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const tokenVerify = (plaintext, hash) =>
  new Promise((resolve) => {
    bcrypt.compare(plaintext, hash, function (error, result) {
      if (!error && result) resolve(result); // true or false
      else resolve(false);
    });
  });

const getToken = (payload) => jwt.sign(payload, process.env.SECRET, { expiresIn: `${process.env.EXPIRE}h` });

const getPasswordHash = (password, saltRounds = 10) =>
  new Promise((resolve, reject) => {
    try {
      bcrypt.genSalt(saltRounds, (err, salt) => {
        bcrypt.hash(password, salt, (err, hash) => {
          // Store hash in your password DB.
          resolve(hash);
        });
      });
    } catch (error) {
      logger.error(error, error.stack);
      reject(error);
    }
  });

const jwtVerify = (token = '') => jwt.verify(token, process.env.SECRET);

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7, authHeader.length);
      const response = jwtVerify(token);
      if (!('exp' in response) || response.exp * 1000 <= +new Date())
        return res.status(401).json({
          status: 'error',
          message: 'unauthorized: expire token',
        });
      req.auth = response;
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

export { authMiddleware, getPasswordHash, tokenVerify, getToken, jwtVerify };
