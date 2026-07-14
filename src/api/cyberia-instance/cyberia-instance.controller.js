import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';
import { CyberiaInstanceMapService } from './cyberia-instance-map.service.js';

const logger = loggerFactory(import.meta);

// The C client fetches the instance map cross-origin (same as quest metadata).
const allowCrossOrigin = (req, res) => {
  if (req && req.headers && req.headers.origin) {
    res.set('Access-Control-Allow-Origin', req.headers.origin);
  } else res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

class CyberiaInstanceController {
  static instanceMapStatic = async (req, res, options) => {
    try {
      allowCrossOrigin(req, res);
      const result = await CyberiaInstanceMapService.getStatic(req, res, options);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(404).json({ status: 'error', message: error.message });
    }
  };
  static instanceMapDynamic = async (req, res, options) => {
    try {
      allowCrossOrigin(req, res);
      const result = await CyberiaInstanceMapService.getDynamic(req, res, options);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(404).json({ status: 'error', message: error.message });
    }
  };
  static fallbackWorld = async (req, res, options) => {
    try {
      const result = await CyberiaInstanceService.fallbackWorld(req);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  };
  static portalConnect = async (req, res, options) => {
    try {
      const result = await CyberiaInstanceService.portalConnect(req, res, options);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  };
  static post = async (req, res, options) => {
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
  };
  static get = async (req, res, options) => {
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
  };
  static put = async (req, res, options) => {
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
  };
  static delete = async (req, res, options) => {
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
  };
}

export { CyberiaInstanceController };
