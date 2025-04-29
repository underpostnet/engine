import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const PopService = {
  post: async (req, res, options) => {
    /** @type {import('./pop.model.js').PopModel} */
    const Pop = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Pop;
    return await new Pop(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./pop.model.js').PopModel} */
    const Pop = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Pop;
    if (req.params.id) return await Pop.findById(req.params.id);
    return await Pop.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./pop.model.js').PopModel} */
    const Pop = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Pop;
    return await Pop.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./pop.model.js').PopModel} */
    const Pop = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Pop;
    if (req.params.id) return await Pop.findByIdAndDelete(req.params.id);
    else return await Pop.deleteMany();
  },
};

export { PopService };
