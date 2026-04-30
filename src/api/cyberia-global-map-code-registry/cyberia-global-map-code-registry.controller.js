import { loggerFactory } from '../../server/logger.js';
import { CyberiaGlobalMapCodeRegistryService } from './cyberia-global-map-code-registry.service.js';

const logger = loggerFactory(import.meta);

class CyberiaGlobalMapCodeRegistryController {
  static post = async (req, res, options) => {
    try {
      const result = await CyberiaGlobalMapCodeRegistryService.post(req, res, options);
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
      const result = await CyberiaGlobalMapCodeRegistryService.get(
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
      const result = await CyberiaGlobalMapCodeRegistryService.put(req, res, options);
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
      const result = await CyberiaGlobalMapCodeRegistryService.delete(req, res, options);
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

export { CyberiaGlobalMapCodeRegistryController };
