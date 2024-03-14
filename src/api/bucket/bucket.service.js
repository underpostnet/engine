import { loggerFactory } from '../../server/logger.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

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
        result = await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket(req.body).save();
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        // .populate('files')
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.find({
          userId: req.auth.user._id,
          name: 'storage',
        }).populate(select.get);
        if (!result[0])
          result = [
            await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket({
              files: [],
              name: 'storage',
              userId: req.auth.user._id,
            }).save(),
          ];

        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        if (req.params.filesId) {
          // https://www.mongodb.com/docs/manual/reference/operator/
          // db.profiles.insertOne({ _id: 1, votes: [3, 5, 6, 7, 7, 8] });
          // The following operation will remove all items from the votes array that are greater than or equal to ( $gte ) 6:
          // db.profiles.updateOne({ _id: 1 }, { $pull: { votes: { $gte: 6 } } });
          // After the update operation, the document only has values less than 6:
          // { _id: 1, votes: [  3,  5 ] }
          result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.updateOne(
            { _id: req.params.id },
            { $pull: { files: { _id: req.params.filesId } } },
            { runValidators: true },
          );
          const find = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.find({
            _id: req.params.id,
          }).populate(select.get);
          result = find[0];
        }
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      default:
        {
          // result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
          result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.updateOne(
            { _id: req.params.id },
            { $push: { files: { $each: req.body.files } } },
            { runValidators: true },
          );
          const find = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Bucket.find({
            _id: req.params.id,
          }).populate(select.get);
          result = find[0];
        }
        break;
    }
    return result;
  },
};

export { BucketService };
