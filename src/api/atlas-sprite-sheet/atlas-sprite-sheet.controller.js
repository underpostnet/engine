import { loggerFactory } from '../../server/logger.js';
import { AtlasSpriteSheetService } from './atlas-sprite-sheet.service.js';

const logger = loggerFactory(import.meta);

class AtlasSpriteSheetController {
  static blob = async (req, res, options) => {
    try {
      if (req && req.headers && req.headers.origin) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
      } else res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      const { buffer, mimetype, name } = await AtlasSpriteSheetService.blob(req, res, options);
      res.set('Content-Type', mimetype);
      res.set('Content-Length', buffer.length);
      res.set('Content-Disposition', `inline; filename="${name}"`);
      return res.status(200).end(buffer);
    } catch (error) {
      logger.error('AtlasSpriteSheetController.blob error:', error);
      return res.status(404).json({
        status: 'error',
        message: error.message,
      });
    }
  };
  static generate = async (req, res, options) => {
    try {
      const result = await AtlasSpriteSheetService.generate(req, res, options);
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error('AtlasSpriteSheetController.generate error:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  };
  static deleteByObjectLayerId = async (req, res, options) => {
    try {
      const result = await AtlasSpriteSheetService.deleteByObjectLayerId(req, res, options);
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error('AtlasSpriteSheetController.deleteByObjectLayerId error:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  };
  static post = async (req, res, options) => {
    try {
      const result = await AtlasSpriteSheetService.post(req, res, options);
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
      const { page, limit } = req.query;
      const result = await AtlasSpriteSheetService.get(
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
      const result = await AtlasSpriteSheetService.put(req, res, options);
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
      const result = await AtlasSpriteSheetService.delete(req, res, options);
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
  static getMetadata = async (req, res, options) => {
    try {
      if (req && req.headers && req.headers.origin) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
      } else res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const { page, limit } = req.query;
      const result = await AtlasSpriteSheetService.getMetadata(
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
      return res.status(404).json({
        status: 'error',
        message: error.message,
      });
    }
  };
}

export { AtlasSpriteSheetController };
