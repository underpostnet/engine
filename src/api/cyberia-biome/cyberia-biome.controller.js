import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { ProviderFactoryDB } from '../../db/ProviderFactoryDB.js';

import { loggerFactory } from '../../server/logger.js';
import { CyberiaBiomeModel } from './cyberia-biome.model.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-controller` });

const DataBaseProvider = {};

const select = {
  'all-name': { _id: 1, name: 1, biome: 1 },
};

const post = async (req, res, options) => {
  try {
    const { host, path } = options;
    await ProviderFactoryDB(options, endpoint, DataBaseProvider);
    const db = DataBaseProvider[`${host}${path}`];
    if (db) logger.info('success get db provider', options.db);

    const { _id } = await new CyberiaBiomeModel(req.body).save();
    const [result] = await CyberiaBiomeModel.find({ _id }).select(select['all-name']);

    return res.status(200).json({
      status: 'success',
      data: result,
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

    // console.log('req.params', req.params);
    // console.log('req.query', req.query);
    // console.log('req.body', req.body);

    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaBiomeModel.find();
        break;
      case 'all-name':
        result = await CyberiaBiomeModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        break;
    }

    // throw { message: 'error test' };
    return res.status(200).json({
      status: 'success',
      data: result,
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
