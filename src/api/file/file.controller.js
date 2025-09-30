import { loggerFactory } from '../../server/logger.js';
import { FileService } from './file.service.js';
const logger = loggerFactory(import.meta);

const FileController = {
  post: async (req, res, options) => {
    try {
      return res.status(200).json({
        status: 'success',
        data: await FileService.post(req, res, options),
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
      const result = await FileService.get(req, res, options);
      if (result instanceof Buffer) {
        if (
          process.env.NODE_ENV === 'development' ||
          req.hostname === options.host ||
          (options.origins && options.origins.find((o) => o.match(req.hostname)))
        ) {
          res.set('Cross-Origin-Resource-Policy', 'cross-origin');
          return res.status(200).end(result);
        }
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden',
        });
      }

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
  delete: async (req, res, options) => {
    try {
      const result = await FileService.delete(req, res, options);
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

export { FileController };
