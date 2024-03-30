import { loggerFactory } from '../../server/logger.js';
import { BlockChainModel } from './blockchain.model.js';

const logger = loggerFactory(import.meta);

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
