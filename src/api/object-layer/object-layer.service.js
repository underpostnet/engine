import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const ObjectLayerService = {
  post: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    return await new ObjectLayer(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    if (req.params.id) return await ObjectLayer.findById(req.params.id);
    return await ObjectLayer.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    return await ObjectLayer.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    if (req.params.id) return await ObjectLayer.findByIdAndDelete(req.params.id);
    else return await ObjectLayer.deleteMany();
  },
};

export { ObjectLayerService };
