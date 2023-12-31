import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { ProviderFactoryDB } from '../../db/ProviderFactoryDB.js';

import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldService } from './cyberia-world.service.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-controller` });

const DataBaseProvider = {};

const CyberiaWorldController = {
  post: async (req, res, options) => {
    try {
      const { host, path } = options;
      await ProviderFactoryDB(options, endpoint, DataBaseProvider);
      const db = DataBaseProvider[`${host}${path}`];
      if (db) logger.info('success get db provider', options.db);
      return res.status(200).json({
        status: 'success',
        data: await CyberiaWorldService.post(req, res, options),
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  },
  get: async (req, res, options) => {
    try {
      const { host, path } = options;
      await ProviderFactoryDB(options, endpoint, DataBaseProvider);
      const db = DataBaseProvider[`${host}${path}`];
      if (db) logger.info('success get db provider', options.db);

      // throw { message: 'error test' };
      return res.status(200).json({
        status: 'success',
        message: 'success-world',
        data: await CyberiaWorldService.get(req, res, options),
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  },
  delete: async (req, res, options) => {
    try {
      const { host, path } = options;
      await ProviderFactoryDB(options, endpoint, DataBaseProvider);
      const db = DataBaseProvider[`${host}${path}`];
      if (db) logger.info('success get db provider', options.db);
      const result = await CyberiaWorldService.delete(req, res, options);
      if (!result)
        return res.status(400).json({
          status: 'error',
          message: 'item not found',
        });

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'success-delete',
      });
    } catch (error) {
      logger.error(error, error.stack);
      return res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  },
};

export { CyberiaWorldController };
