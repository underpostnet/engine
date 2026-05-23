import { loggerFactory } from '../../server/logger.js';
import { CyberiaClientHintsService } from './cyberia-client-hints.service.js';

const logger = loggerFactory(import.meta);

class CyberiaClientHintsController {
  static post = async (req, res, options) => {
    try {
      const result = await CyberiaClientHintsService.post(req, res, options);
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
      const result = await CyberiaClientHintsService.get(
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
      const result = await CyberiaClientHintsService.put(req, res, options);
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
      const result = await CyberiaClientHintsService.delete(req, res, options);
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

export { CyberiaClientHintsController };
