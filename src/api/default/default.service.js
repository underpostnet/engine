import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const DefaultService = {
  post: async (req, res, options) => {
    let result;
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result;
    switch (req.params.id) {
      default:
        result = false;
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    let result;
    switch (req.params.id) {
      default:
        result = false;
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result;
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
};

export { DefaultService };
