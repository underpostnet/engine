import { loggerFactory } from '../../server/logger.js';
import { getCyberiaPortByWorldPath } from '../cyberia-world/cyberia-world.service.js';
import { CyberiaUserService } from './cyberia-user.service.js';
const logger = loggerFactory(import.meta);

const CyberiaUserController = {
  post: async (req, res, options) => {
    try {
      const result = await CyberiaUserService.post(req, res, options);
      return res.status(200).json({
        status: 'success',
        data: result,
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
        data: await CyberiaUserService.get(req, res, options),
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
      const result = await CyberiaUserService.delete(req, res, options);
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
  },
  put: async (req, res, options) => {
    try {
      const result = await CyberiaUserService.put(req, res, options);
      return res.status(200).json({
        status: 'success',
        data: result,
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

export { CyberiaUserController };
