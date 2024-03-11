import { loggerFactory } from '../../server/logger.js';
import { BucketModel } from './bucket.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  get: {
    path: 'files',
    populate: {
      path: 'fileId',
      model: 'File',
      select: '_id name mimetype',
    },
  },
};

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
        // .populate('files')
        result = await BucketModel.find({ userId: req.auth.user._id, name: 'storage' }).populate(select.get);
        if (!result[0])
          result = [await new BucketModel({ files: [], name: 'storage', userId: req.auth.user._id }).save()];

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
  put: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        {
          // result = await BucketModel.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
          result = await BucketModel.updateOne(
            { _id: req.params.id },
            { $push: { files: { $each: req.body.files } } },
            { runValidators: true },
          );
          const find = await BucketModel.find({ _id: req.params.id }).populate(select.get);
          result = find[0];
        }
        break;
    }
    return result;
  },
};

export { BucketService };
