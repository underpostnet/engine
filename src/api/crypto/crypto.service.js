import { loggerFactory } from '../../server/logger.js';
import { CryptoModel } from './crypto.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import crypto from 'crypto';
import { UserModel } from '../user/user.model.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const CryptoService = {
  post: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'verify':
        {
          const signature = Buffer.from(req.body.signature, 'base64');

          const publicKey = await crypto.subtle.importKey(
            'jwk',
            req.body.publicKey,
            {
              name: 'ECDSA',
              namedCurve: 'P-384',
              hash: 'SHA-256',
            },
            true,
            ['verify'],
          );

          const isValid = await crypto.subtle.verify(
            {
              name: 'ECDSA',
              hash: 'SHA-256',
            },
            publicKey,
            signature,
            new TextEncoder().encode(JSON.stringify(req.body.payload)),
          );

          result = { isValid };

          logger.info('Crypto sign verify', result);
        }
        break;
      default:
        result = await new CryptoModel(req.body).save();
        const user = await UserModel.findById(req.auth.user._id);
        user.publicKey.push(result._id);
        {
          const result = await UserModel.findByIdAndUpdate(req.auth.user._id, user, {
            runValidators: true,
          });
        }
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
};

export { CryptoService };
