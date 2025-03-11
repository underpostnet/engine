import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { CyberiaBiomeDto } from './cyberia-biome.model.js';
import { CyberiaWsInstanceScope } from '../../ws/cyberia/cyberia.ws.server.js';

const logger = loggerFactory(import.meta);

const CyberiaBiomeService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBiome;

    switch (req.params.id) {
      default: {
        const { _id } = await new CyberiaBiome(req.body).save();
        return await CyberiaBiome.findOne({
          _id,
        }).select(CyberiaBiomeDto.select.get());
      }
    }
  },
  get: async (req, res, options) => {
    const wsManagementId = `${options.host}${options.path}`;
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[wsManagementId].mongoose.models.CyberiaBiome;

    switch (req.params.id) {
      case 'matrix-params':
        return {
          dim: CyberiaWsInstanceScope[wsManagementId].biome.instance.dim,
          dimPaintByCell: CyberiaWsInstanceScope[wsManagementId].biome.instance.dimPaintByCell,
          dimAmplitude: CyberiaWsInstanceScope[wsManagementId].biome.instance.dimAmplitude,
          name: CyberiaWsInstanceScope[wsManagementId].biome.instance.name,
          quests: CyberiaWsInstanceScope[wsManagementId].world.instance._doc.quests,
        };
      case 'all':
        return await CyberiaBiome.find();

      case 'all-name':
        return await CyberiaBiome.find().select(CyberiaBiomeDto.select.get());

      default:
        return await CyberiaBiome.find({
          _id: req.params.id,
        });
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBiome;

    switch (req.params.id) {
      default:
        return await CyberiaBiome.findByIdAndDelete(req.params.id);
    }
  },
};

export { CyberiaBiomeService };
