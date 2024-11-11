import { MongooseDB } from './mongo/MongooseDB.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

const DataBaseProvider = {
  instance: {},
  load: async function (options = { apis: [], host: '', path: '', db: {} }) {
    try {
      const { apis, host, path, db } = options;

      if (!this.instance[`${host}${path}`]) this.instance[`${host}${path}`] = {};

      if (!db || this.instance[`${host}${path}`][db.provider]) return;

      // logger.info(`Load ${db.provider} provider`, `${host}${path}`);
      switch (db.provider) {
        case 'mongoose':
          {
            const conn = await MongooseDB.connect(db.host, db.name);
            this.instance[`${host}${path}`][db.provider] = {
              models: await MongooseDB.loadModels({ conn, apis }),
              connection: conn,
              close: async () => {
                return await new Promise((resolve) => {
                  DataBaseProvider.instance[`${host}${path}`][db.provider].connection.close().then(() => {
                    // logger.info('Mongoose connection is disconnected', db);
                    return resolve();
                  });
                });
              },
            };
          }
          break;
        default:
          break;
      }
      return this.instance[`${host}${path}`][db.provider];
    } catch (error) {
      logger.error(error, { error: error.stack, options });
      return undefined;
    }
  },
};
export { DataBaseProvider };
