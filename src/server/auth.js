import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

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
      reject(error);
    }
  });

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7, authHeader.length);
      const response = jwt.verify(token, process.env.SECRET);
      if (!('exp' in response) || response.exp * 1000 <= +new Date())
        return res.status(401).json({
          status: 'error',
          message: 'unauthorized: expire token',
        });
      return next();
    }
    return res.status(401).json({
      status: 'error',
      message: 'unauthorized: invalid token',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

export { authMiddleware, getPasswordHash };
