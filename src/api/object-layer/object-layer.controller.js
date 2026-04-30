import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerService } from './object-layer.service.js';

const logger = loggerFactory(import.meta);

class ObjectLayerController {
  static post = async (req, res, options) => {
    try {
      const result = await ObjectLayerService.post(req, res, options);
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
      if (req && req.headers && req.headers.origin) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
      } else res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const result = await ObjectLayerService.get(req, res, options);
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
  static generateWebp = async (req, res, options) => {
    try {
      const result = await ObjectLayerService.generateWebp(req, res, options);
      if (req && req.headers && req.headers.origin) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
      } else res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${req.params.itemType}_${req.params.itemId}_${req.params.directionCode}.webp"`,
      );
      res.setHeader('Content-Length', result.length);
      return res.status(200).end(result);
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
      const result = await ObjectLayerService.put(req, res, options);
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
      const result = await ObjectLayerService.delete(req, res, options);
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

export { ObjectLayerController };
