import { loggerFactory } from '../../server/logger.js';
import { BlockChainModel } from './blockchain.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const BlockChainService = {
  post: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
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

export { BlockChainService };
