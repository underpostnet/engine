import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import dotenv from 'dotenv';
import { CyberiaWorldDto } from './cyberia-world.model.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWorldService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;
    switch (req.params.id) {
      default: {
        const { _id } = await new CyberiaWorld(req.body).save();
        return await CyberiaWorld.findOne({
          _id,
        })
          .select(CyberiaWorldDto.select.get())
          .populate(CyberiaWorldDto.populate.get());
      }
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;

    switch (req.params.id) {
      case 'all':
        return await CyberiaWorld.find().populate(CyberiaWorldDto.populate.get());

      case 'all-test':
        return await CyberiaWorld.aggregate(CyberiaWorldDto.aggregate.get());

      case 'all-name':
        return await CyberiaWorld.find().select(CyberiaWorldDto.select.get());

      default:
        if (options.cyberia.world.instance)
          return await CyberiaWorld.find({
            _id: options.cyberia.world.instance._id.toString(),
          });
        else throw new Error('CyberiaWorld instance not found');
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;

    switch (req.params.id) {
      default:
        return await CyberiaWorld.findByIdAndDelete(req.params.id);
    }
  },
};

export { CyberiaWorldService };
