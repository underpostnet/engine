import { loggerFactory } from '../../server/logger.js';
import { EventService } from './event.service.js';

const logger = loggerFactory(import.meta);

const EventController = {
  post: async (req, res, options) => {
    try {
      const result = await EventService.post(req, res, options);
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
      const result = await EventService.get(req, res, options);
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
      const result = await EventService.put(req, res, options);
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
      const result = await EventService.delete(req, res, options);
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

export { EventController };
