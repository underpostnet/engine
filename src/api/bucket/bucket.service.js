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

    switch (req.params.id) {
      default:
        req.body.userId = req.auth.user._id;
        return await new Bucket(req.body).save();
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    switch (req.params.id) {
      default:
        return await Bucket.find({
          userId: req.auth.user._id,
        }).populate(select.get);
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    switch (req.params.id) {
      default:
        return await Bucket.findByIdAndDelete(req.params.id);
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./bucket.model.js').BucketModel} */
    const Bucket = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket;

    switch (req.params.id) {
      default:
    }
  },
};

export { BucketService };
