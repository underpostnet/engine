import { MongooseDB } from './mongoose/MongooseDB.js';
import { loggerFactory } from '../server/logger.js';

import { BucketSchema } from '../api/bucket/bucket.model.js';
import { CryptoSchema } from '../api/crypto/crypto.model.js';
import { FileSchema } from '../api/file/file.model.js';
import { PinSchema } from '../api/ipfs/ipfs.model.js';
import { UserSchema } from '../api/user/user.model.js';
import { BlockChainSchema } from '../api/blockchain/blockchain.model.js';
import { CyberiaUserSchema } from '../api/cyberia-user/cyberia-user.model.js';
import { CyberiaBiomeSchema } from '../api/cyberia-biome/cyberia-biome.model.js';
import { CyberiaTileSchema } from '../api/cyberia-tile/cyberia-tile.model.js';
import { CyberiaWorldSchema } from '../api/cyberia-world/cyberia-world.model.js';

const logger = loggerFactory(import.meta);

const DataBaseProvider = {
  instance: {},
  load: async function (options = { apis: [], host: '', path: '', db: {} }) {
    try {
      const { apis, host, path, db } = options;

      if (!this.instance[`${host}${path}`]) this.instance[`${host}${path}`] = {};

      if (!db || this.instance[`${host}${path}`][db.provider]) return;

      this.instance[`${host}${path}`][db.provider] = {};

      // logger.info(`Load ${db.provider} provider`, `${host}${path}`);
      switch (db.provider) {
        case 'mongoose':
          {
            const conn = await MongooseDB.connect(db.host, db.name);
            for (const api of apis)
              switch (api) {
                case 'user':
                  this.instance[`${host}${path}`][db.provider].User = conn.model('User', UserSchema);
                  break;
                case 'file':
                  this.instance[`${host}${path}`][db.provider].File = conn.model('File', FileSchema);
                  break;
                case 'ipfs':
                  this.instance[`${host}${path}`][db.provider].Pin = conn.model('Pin', PinSchema);
                  break;
                case 'crypto':
                  this.instance[`${host}${path}`][db.provider].Crypto = conn.model('Crypto', CryptoSchema);
                  break;
                case 'bucket':
                  this.instance[`${host}${path}`][db.provider].Bucket = conn.model('Bucket', BucketSchema);
                  break;
                case 'blockchain':
                  this.instance[`${host}${path}`][db.provider].BlockChain = conn.model('BlockChain', BlockChainSchema);
                  break;
                case 'cyberia-user':
                  this.instance[`${host}${path}`][db.provider].CyberiaUser = conn.model(
                    'CyberiaUser',
                    CyberiaUserSchema,
                  );
                  break;
                case 'cyberia-biome':
                  this.instance[`${host}${path}`][db.provider].CyberiaBiome = conn.model(
                    'CyberiaBiome',
                    CyberiaBiomeSchema,
                  );
                  break;
                case 'cyberia-tile':
                  this.instance[`${host}${path}`][db.provider].CyberiaTile = conn.model(
                    'CyberiaTile',
                    CyberiaTileSchema,
                  );
                  break;
                case 'cyberia-world':
                  this.instance[`${host}${path}`][db.provider].CyberiaWorld = conn.model(
                    'CyberiaWorld',
                    CyberiaWorldSchema,
                  );
                  break;
              }
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
