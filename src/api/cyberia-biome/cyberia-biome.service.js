import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
const logger = loggerFactory(import.meta);

const select = {
  'all-name': {
    _id: 1,
    name: 1,
    biome: 1,
    fileId: 1,
    topLevelColorFileId: 1,
    dim: 1,
    dimAmplitude: 1,
    dimPaintByCell: 1,
  },
};

const CyberiaBiomeService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    switch (req.params.id) {
      default: {
        const { _id } = await new CyberiaBiome(req.body).save();
        return await CyberiaBiome.findOne({
          _id,
        }).select(select['all-name']);
      }
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    switch (req.params.id) {
      case 'all':
        return await CyberiaBiome.find();

      case 'all-name':
        return await CyberiaBiome.find().select(select['all-name']);

      default:
        return await CyberiaBiome.find({
          _id: req.params.id,
        });
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

    switch (req.params.id) {
      default:
        return await CyberiaBiome.findByIdAndDelete(req.params.id);
    }
  },
};

export { CyberiaBiomeService };
