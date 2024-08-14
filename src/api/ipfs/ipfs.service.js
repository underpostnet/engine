import { loggerFactory } from '../../server/logger.js';
import pinataSDK from '@pinata/sdk';
import dotenv from 'dotenv';

dotenv.config();
const logger = loggerFactory(import.meta);

const IPFSService = {
  post: async (req, res, options) => {
    const pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);
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
