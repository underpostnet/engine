import { loggerFactory } from '../../server/logger.js';
import { BlockChainService } from './blockchain.service.js';

const logger = loggerFactory(import.meta);

const BlockChainController = {
  post: async (req, res, options) => {
    try {
      return res.status(200).json({
        status: 'success',
        data: await BlockChainService.post(req, res, options),
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
  },
  get: async (req, res, options) => {
    try {
      return res.status(200).json({
        status: 'success',
        data: await BlockChainService.get(req, res, options),
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
  },
  delete: async (req, res, options) => {
    try {
      return res.status(200).json({
        status: 'success',
        data: await BlockChainService.delete(req, res, options),
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
  },
};

export { BlockChainController };
