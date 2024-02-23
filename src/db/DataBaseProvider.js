import { loggerFactory } from '../server/logger.js';
import { MongooseDB } from './mongoose/MongooseDB.js';

const logger = loggerFactory(import.meta);

const DataBaseProvider = {
  instance: {},
  load: async function (options = { host: '', path: '', db: {} }) {
    try {
      const { host, path, db } = options;
      if (!this.instance[`${host}${path}`]) this.instance[`${host}${path}`] = {};

      if (!db || this.instance[`${host}${path}`][db.provider]) return;

      // logger.info(`Load ${db.provider} provider`, `${host}${path}`);
      switch (db.provider) {
        case 'mongoose':
          this.instance[`${host}${path}`][db.provider] = await MongooseDB.connect(db.host, db.name);
          break;
        default:
          break;
      }
      return this.instance[`${host}${path}`][db.provider];
    } catch (error) {
      logger.info(error, { error: error.stack, options });
      return undefined;
    }
  },
};
export { DataBaseProvider };
