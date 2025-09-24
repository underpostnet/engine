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
    const { query, page = 1, limit = 10, sort = { updatedAt: -1 } } = req.query;
    const queryPayload = query ? JSON.parse(query) : {};
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Default.find(queryPayload).sort(sort).limit(limit).skip(skip),
      Default.countDocuments(queryPayload),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
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
