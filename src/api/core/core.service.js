import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { shellExec } from '../../server/process.js';

const logger = loggerFactory(import.meta);

const CoreService = {
  post: async (req, res, options) => {
    /** @type {import('./core.model.js').CoreModel} */
    const Core = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Core;
    return await new Core(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./core.model.js').CoreModel} */
    const Core = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Core;
    return await Core.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./core.model.js').CoreModel} */
    const Core = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Core;
    return await Core.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./core.model.js').CoreModel} */
    const Core = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Core;
    return await Core.findByIdAndDelete(req.params.id);
  },
};

export { CoreService };
