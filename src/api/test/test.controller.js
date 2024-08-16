import { loggerFactory } from '../../server/logger.js';
import { TestService } from './test.service.js';

const logger = loggerFactory(import.meta);

const TestController = {
  post: async (req, res, options) => {
    try {
      return res.status(200).json({
        status: 'success',
        data: await TestService.post(req, res, options),
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
      const result = await TestService.get(req, res, options);
      if (result)
        return res.status(200).json({
          status: 'success',
          data: result,
        });
      else
        return res.status(400).json({
          status: 'error',
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
      const result = await TestService.delete(req, res, options);

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

export { TestController };
