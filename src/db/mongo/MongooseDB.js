import mongoose from 'mongoose';

import { loggerFactory } from '../../server/logger.js';
import { getCapVariableName } from '../../server/conf.js';

const logger = loggerFactory(import.meta);

const MongooseDB = {
  connect: async (host, name) => {
    const uri = `${host}/${name}`;
    // logger.info('MongooseDB connect', { host, name, uri });
    return await mongoose.createConnection(uri).asPromise();
    return new Promise((resolve, reject) =>
      mongoose
        .connect(
          uri,
          // ,{
          //   useNewUrlParser: true,
          //   useUnifiedTopology: true,
          // }
        )
        .then((db) => {
          logger.info(`db connected`, uri);
          return resolve(db);
        })
        .catch((err) => {
          logger.error(err, { host, name, error: err.stack });
          // return reject(err);
          return resolve(undefined);
        }),
    );
  },
  loadModels: async function (options = { apis: ['test'], conn: new mongoose.Connection() }) {
    const { conn, apis } = options;
    const models = {};
    for (const api of apis) {
      const { ProviderSchema } = await import(`../../api/${api}/${api}.model.js`);
      const keyModel = getCapVariableName(api);
      models[keyModel] = conn.model(keyModel, ProviderSchema);
    }

    return models;
  },
};

export { MongooseDB };
