import { loggerFactory } from '../../server/logger.js';
import pinataSDK from '@pinata/sdk';
import dotenv from 'dotenv';

dotenv.config();
const logger = loggerFactory(import.meta);

const IPFSService = {
  post: async (req, res, options) => {
    const pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);
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

export { IPFSService };
