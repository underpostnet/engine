import { loggerFactory } from '../../server/logger.js';
import crypto from 'crypto';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
const logger = loggerFactory(import.meta);

const CryptoService = {
  post: async (req, res, options) => {
    /** @type {import('./crypto.model.js').CryptoModel} */
    const Crypto = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Crypto;
    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    switch (req.params.id) {
      case 'verify': {
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

        return { isValid };
      }
      default: {
        const publicKey = await new Crypto(req.body).save();
        const user = await User.findById(req.auth.user._id);
        user.publicKey.push(publicKey._id);
        await User.findByIdAndUpdate(req.auth.user._id, user, {
          runValidators: true,
        });
        return publicKey;
      }
    }
  },
  get: async (req, res, options) => {
    switch (req.params.id) {
      default:
    }
  },
  delete: async (req, res, options) => {
    switch (req.params.id) {
      default:
    }
  },
};

export { CryptoService };
