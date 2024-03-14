import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
const logger = loggerFactory(import.meta);

const select = {
  get: {
    path: 'fileId',
    model: 'File',
    select: '_id name mimetype',
  },
};

const BucketService = {
  post: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        req.body.userId = req.auth.user._id;
        result = await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket(req.body).save();
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.find({
          userId: req.auth.user._id,
        }).populate(select.get);
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.findByIdAndDelete(
          req.params.id,
        );
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
};

export { BucketService };
