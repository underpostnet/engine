import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceDto } from './cyberia-instance.model.js';

const logger = loggerFactory(import.meta);

const CyberiaInstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    return await new CyberiaInstance(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    if (req.params.id === 'lite') return await CyberiaInstance.find().select(CyberiaInstanceDto.select.lite());
    if (req.params.id) return await CyberiaInstance.findById(req.params.id);
    return await CyberiaInstance.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    return await CyberiaInstance.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    if (req.params.id) return await CyberiaInstance.findByIdAndDelete(req.params.id);
    else return await CyberiaInstance.deleteMany();
  },
};

export { CyberiaInstanceService };
