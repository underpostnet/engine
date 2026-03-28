import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

const CyberiaInstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    if (req.auth && req.auth.user) req.body.creator = req.auth.user._id;
    return await new CyberiaInstance(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const populateCreator = { path: 'creator', model: 'User', select: '_id username' };
    if (req.params.id) return await CyberiaInstance.findById(req.params.id).populate(populateCreator);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaInstance.find(query).sort(sort).limit(limit).skip(skip).populate(populateCreator),
      CyberiaInstance.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const instance = await CyberiaInstance.findById(req.params.id);
    if (!instance) throw new Error('instance not found');
    if (req.auth.user.role !== 'admin' && String(instance.creator) !== String(req.auth.user._id))
      throw new Error('insufficient permission');
    if (req.body.thumbnail && instance.thumbnail && String(req.body.thumbnail) !== String(instance.thumbnail)) {
      const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
      await File.findByIdAndDelete(instance.thumbnail);
    }
    return await CyberiaInstance.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    if (req.params.id) {
      const instance = await CyberiaInstance.findById(req.params.id);
      if (!instance) throw new Error('instance not found');
      if (req.auth.user.role !== 'admin' && String(instance.creator) !== String(req.auth.user._id))
        throw new Error('insufficient permission');
      if (instance.thumbnail) {
        const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
        await File.findByIdAndDelete(instance.thumbnail);
      }
      return await CyberiaInstance.findByIdAndDelete(req.params.id);
    } else return await CyberiaInstance.deleteMany();
  },
};

export { CyberiaInstanceService };
