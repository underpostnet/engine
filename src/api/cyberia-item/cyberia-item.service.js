import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const CyberiaItemService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    return await new CyberiaItem(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    if (req.params.id) return await CyberiaItem.findById(req.params.id);
    return await CyberiaItem.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    return await CyberiaItem.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    if (req.params.id) return await CyberiaItem.findByIdAndDelete(req.params.id);
    else return await await CyberiaItem.deleteMany();
  },
};

export { CyberiaItemService };
