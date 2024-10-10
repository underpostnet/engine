import { loggerFactory } from '../../server/logger.js';
import dotenv from 'dotenv';

dotenv.config();
const logger = loggerFactory(import.meta);

const IPFSService = {
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

export { IPFSService };
