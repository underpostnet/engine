import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
const logger = loggerFactory(import.meta);

const select = {
  'all-name': { _id: 1, name: 1, biome: 1, fileId: 1, dim: 1, dimAmplitude: 1, dimPaintByCell: 1 },
};

const CyberiaBiomeService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    const { _id } = await new CyberiaBiome(req.body).save();
    const [result] = await CyberiaBiome.find({
      _id,
    }).select(select['all-name']);
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaBiome.find();
        break;
      case 'all-name':
        result = await CyberiaBiome.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await CyberiaBiome.find({
          _id: req.params.id,
        });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await CyberiaBiome.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaBiomeService };
