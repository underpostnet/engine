import { loggerFactory } from '../server/logger.js';
import { MongooseDB } from './mongoose/MongooseDB.js';

const logger = loggerFactory(import.meta);

const ProviderFactoryDB = async (options, endpoint, DataBaseProvider) => {
  const { host, path, db } = options;
  if (!db) return;
  logger.info(`Load ${db.provider} provider`, `${host}${path}`);
  switch (db.provider) {
    case 'mongoose':
      if (db && !(`${host}${path}` in DataBaseProvider))
        DataBaseProvider[`${host}${path}`] = await MongooseDB.connect(db.host, endpoint, db.name);
      break;
    default:
      break;
  }
};
export { ProviderFactoryDB };
