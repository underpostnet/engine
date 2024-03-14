import { loggerFactory } from '../../server/logger.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1, biome: 1, fileId: 1, dim: 1, dimAmplitude: 1, dimPaintByCell: 1 },
};

const CyberiaBiomeService = {
  post: async (req, res, options) => {
    const { _id } = await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome(
      req.body,
    ).save();
    const [result] = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome.find({
      _id,
    }).select(select['all-name']);
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome.find();
        break;
      case 'all-name':
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome.find().select(
          select['all-name'],
        );
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome.find({
          _id: req.params.id,
        });
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
        result = await DataBaseProvider.instance[
          `${options.host}${options.path}`
        ].mongoose.CyberiaBiome.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaBiomeService };
