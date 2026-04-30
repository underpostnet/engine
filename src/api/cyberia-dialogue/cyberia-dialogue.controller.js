import { loggerFactory } from '../../server/logger.js';
import { CyberiaDialogueService } from './cyberia-dialogue.service.js';

const logger = loggerFactory(import.meta);

class CyberiaDialogueController {
  static post = async (req, res, options) => {
    try {
      const result = await CyberiaDialogueService.post(req, res, options);
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
      const result = await CyberiaDialogueService.get(
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
      const result = await CyberiaDialogueService.put(req, res, options);
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
      const result = await CyberiaDialogueService.delete(req, res, options);
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
  static getByItemId = async (req, res, options) => {
    try {
      if (req && req.headers && req.headers.origin) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
      } else res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const result = await CyberiaDialogueService.getByItemId(req, res, options);
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

export { CyberiaDialogueController };
