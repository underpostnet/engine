import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { InstanceDto } from './instance.model.js';

const logger = loggerFactory(import.meta);

const InstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    return await new Instance(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    if (req.params.id) return await Instance.findById(req.params.id);
    return await Instance.find().populate(InstanceDto.populate.get());
  },
  put: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    return await Instance.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    if (req.params.id) return await Instance.findByIdAndDelete(req.params.id);
    else return await await Instance.deleteMany();
  },
};

export { InstanceService };
