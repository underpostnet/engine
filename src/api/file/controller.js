import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const post = (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
    });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

const get = (req, res) => {
  try {
    // throw { message: 'error test' };
    return res.status(200).json({
      status: 'success',
    });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

export { post, get };
