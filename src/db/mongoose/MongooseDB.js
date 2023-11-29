import mongoose from 'mongoose';

import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const MongooseDB = {
  connect: (host, endpoint, dbName) => {
    // ${endpoint}
    const uri = `${host}/${dbName}`;
    logger.info('MongooseDB connect', { host, endpoint, dbName, uri });
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
          logger.error(err, { host, endpoint, dbName, error: err.stack });
          return reject(err);
        }),
    );
  },
};

export { MongooseDB };
