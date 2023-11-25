import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { ProviderFactoryDB } from '../../db/ProviderFactoryDB.js';

import { loggerFactory } from '../../server/logger.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-controller` });

const DataBaseProvider = {};

const post = async (req, res, options) => {
  try {
    const { host, path } = options;
    await ProviderFactoryDB(options, endpoint, DataBaseProvider);
    const db = DataBaseProvider[`${host}${path}`];
    if (db) logger.info('success get db provider', options.db);

    return res.status(200).json({
      status: 'success',
    });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

const get = async (req, res, options) => {
  try {
    const { host, path } = options;
    await ProviderFactoryDB(options, endpoint, DataBaseProvider);
    const db = DataBaseProvider[`${host}${path}`];
    if (db) logger.info('success get db provider', options.db);

    // throw { message: 'error test' };
    return res.status(200).json({
      status: 'success',
    });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

export { post, get };
