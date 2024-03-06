import { loggerFactory } from '../../server/logger.js';
import { CryptoModel } from './crypto.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  ids: { _id: 1 },
};

const CryptoService = {
  post: async (req, res, options) => {
    let result = {};
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
