import mongoose from 'mongoose';

import { BucketSchema } from '../../api/bucket/bucket.model.js';
import { CryptoSchema } from '../../api/crypto/crypto.model.js';
import { FileSchema } from '../../api/file/file.model.js';
import { PinSchema } from '../../api/ipfs/ipfs.model.js';
import { UserSchema } from '../../api/user/user.model.js';
import { BlockChainSchema } from '../../api/blockchain/blockchain.model.js';
import { CyberiaUserSchema } from '../../api/cyberia-user/cyberia-user.model.js';
import { CyberiaBiomeSchema } from '../../api/cyberia-biome/cyberia-biome.model.js';
import { CyberiaTileSchema } from '../../api/cyberia-tile/cyberia-tile.model.js';
import { CyberiaWorldSchema } from '../../api/cyberia-world/cyberia-world.model.js';
import { TestSchema } from '../../api/test/test.model.js';

import { loggerFactory } from '../../server/logger.js';

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
  loadModels: function (options = { apis: ['test'], conn: new mongoose.Connection() }) {
    const { conn, apis } = options;
    const models = {};
    for (const api of apis)
      switch (api) {
        case 'user':
          models.User = conn.model('User', UserSchema);
          break;
        case 'file':
          models.File = conn.model('File', FileSchema);
          break;
        case 'ipfs':
          models.Pin = conn.model('Pin', PinSchema);
          break;
        case 'crypto':
          models.Crypto = conn.model('Crypto', CryptoSchema);
          break;
        case 'bucket':
          models.Bucket = conn.model('Bucket', BucketSchema);
          break;
        case 'test':
          models.Bucket = conn.model('Test', TestSchema);
          break;
        case 'blockchain':
          models.BlockChain = conn.model('BlockChain', BlockChainSchema);
          break;
        case 'cyberia-user':
          models.CyberiaUser = conn.model('CyberiaUser', CyberiaUserSchema);
          break;
        case 'cyberia-biome':
          models.CyberiaBiome = conn.model('CyberiaBiome', CyberiaBiomeSchema);
          break;
        case 'cyberia-tile':
          models.CyberiaTile = conn.model('CyberiaTile', CyberiaTileSchema);
          break;
        case 'cyberia-world':
          models.CyberiaWorld = conn.model('CyberiaWorld', CyberiaWorldSchema);
          break;
      }
    return models;
  },
};

export { MongooseDB };
