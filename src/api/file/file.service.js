import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { FileModel } from './file.model.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const FileService = {
  post: async (req, res, options) => {
    const results = [];
    if (Array.isArray(req.files.file))
      for (const file of req.files.file) results.push(await new FileModel(file).save());
    else if (Object.keys(req.files).length > 0)
      for (const keyFile of Object.keys(req.files)) results.push(await new FileModel(req.files[keyFile]).save());
    return results;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await FileModel.find();
        break;

      default:
        result = await FileModel.find({ _id: req.params.id });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await FileModel.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { FileService };
