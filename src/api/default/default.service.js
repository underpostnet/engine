import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const DefaultService = {
  post: async (req, res, options) => {
    /** @type {import('./default.model.js').DefaultModel} */
    const Default = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Default;
    return await new Default(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./default.model.js').DefaultModel} */
    const Default = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Default;
    if (req.params.id) return await Default.findById(req.params.id);
    return await Default.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./default.model.js').DefaultModel} */
    const Default = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Default;
    return await Default.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./default.model.js').DefaultModel} */
    const Default = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Default;
    if (req.params.id) return await Default.findByIdAndDelete(req.params.id);
    else return await Default.deleteMany();
  },
};

export { DefaultService };
