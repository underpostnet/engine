import { loggerFactory } from '../../server/logger.js';
import { BucketModel } from './bucket.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const BucketService = {
  post: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        if (!req.body.name) req.body.name = 'storage';
        req.body.userId = req.auth.user._id;
        result = await new BucketModel(req.body).save();
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

export { BucketService };
