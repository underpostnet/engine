import mongoose from 'mongoose';

import { loggerFactory } from '../../server/logger.js';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { shellCd, shellExec } from '../../server/process.js';

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
  install: async function () {
    switch (process.platform) {
      case 'win32':
        {
          // https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-windows-unattended/

          // C:\Program Files\MongoDB\Tools\100\bin

          const urlDownload = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14-signed.msi`;
          const folderPath = `./engine-private/setup`;
          if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
          const fullPath = `${folderPath}/${urlDownload.split('/').pop()}`;
          logger.info('destination', fullPath);
          shellCd(folderPath);
        }
        break;
      case 'linux':
        break;
      default:
        break;
    }
  },
};

export { MongooseDB };
