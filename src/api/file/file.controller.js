import { loggerFactory } from '../../server/logger.js';
import { FileService } from './file.service.js';
const logger = loggerFactory(import.meta);

const FileController = {
  post: async (req, res, options) => {
    try {
      const results = await FileService.post(req, res, options);
      if (results.length === 0)
        return res.status(400).json({
          status: 'error',
          message: 'empty or invalid files',
        });
      return res.status(200).json({
        status: 'success',
        data: results,
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
        data: await FileService.get(req, res, options),
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
      const result = await FileService.delete(req, res, options);
      if (!result)
        return res.status(400).json({
          status: 'error',
          message: 'item not found',
        });
      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'success-delete',
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

export { FileController };
