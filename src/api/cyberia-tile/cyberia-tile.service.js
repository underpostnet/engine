import { loggerFactory } from '../../server/logger.js';
import { CyberiaTileModel } from './cyberia-tile.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1, fileId: 1 },
};

const CyberiaTileService = {
  post: async (req, res, options) => {
    const { _id } = await new CyberiaTileModel(req.body).save();
    const [result] = await CyberiaTileModel.find({ _id }).select(select['all-name']);
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaTileModel.find();
        break;
      case 'all-name':
        result = await CyberiaTileModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await CyberiaTileModel.find({ _id: req.params.id });
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
        result = await CyberiaTileModel.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaTileService };
