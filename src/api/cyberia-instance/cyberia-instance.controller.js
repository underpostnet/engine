import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';

const logger = loggerFactory(import.meta);

const CyberiaInstanceController = {
  fallbackWorld: async (req, res, options) => {
    try {
      const result = await CyberiaInstanceService.fallbackWorld(req);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  },
  portalConnect: async (req, res, options) => {
    try {
      const result = await CyberiaInstanceService.portalConnect(req, res, options);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  },
  post: async (req, res, options) => {
    try {
      const result = await CyberiaInstanceService.post(req, res, options);
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
      const { page, limit } = req.query;
      const result = await CyberiaInstanceService.get(
        { ...req, query: { ...req.query, page: parseInt(page), limit: parseInt(limit) } },
        res,
        options,
      );
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
      const result = await CyberiaInstanceService.put(req, res, options);
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
      const result = await CyberiaInstanceService.delete(req, res, options);
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

export { CyberiaInstanceController };
