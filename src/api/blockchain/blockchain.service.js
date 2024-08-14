import { loggerFactory } from '../../server/logger.js';
import { BlockChainModel } from './blockchain.model.js';

const logger = loggerFactory(import.meta);

const BlockChainService = {
  post: async (req, res, options) => {
    switch (req.params.id) {
      default:
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

export { BlockChainService };
