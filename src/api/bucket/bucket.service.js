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
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    let result = {};
    switch (req.params.id) {
      default:
        req.body.userId = req.auth.user._id;
        result = await new Bucket(req.body).save();
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    let result = {};
    switch (req.params.id) {
      default:
        result = await Bucket.find({
          userId: req.auth.user._id,
        }).populate(select.get);
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    let result = {};
    switch (req.params.id) {
      default:
        result = await Bucket.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    let result = {};
    switch (req.params.id) {
      default:
        break;
    }
    return result;
  },
};

export { BucketService };
