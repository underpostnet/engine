import mongoose from 'mongoose';

import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const MongooseDB = {
  connect: (host, endpoint, dbName) => {
    const uri = `${host}${endpoint}-${dbName}`;
    logger.info('MongooseDB connect', { host, endpoint, dbName, uri });
    return new Promise((resolve, reject) =>
      mongoose
        .connect(
          uri
          // ,{
          //   useNewUrlParser: true,
          //   useUnifiedTopology: true,
          // }
        )
        .then((db) => {
          logger.info(`db connected`, { uri, db });
          return resolve(db);
        })
        .catch((err) => {
          logger.error(err, { host, endpoint, dbName, error: err.stack });
          return reject(err);
        })
    );
  },
};

export { MongooseDB };
