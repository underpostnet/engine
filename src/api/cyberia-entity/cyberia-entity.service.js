import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

const CyberiaEntityService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-entity.model.js').CyberiaEntityModel} */
    const CyberiaEntity = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaEntity;
    return await new CyberiaEntity(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-entity.model.js').CyberiaEntityModel} */
    const CyberiaEntity = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaEntity;
    if (req.params.id) return await CyberiaEntity.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaEntity.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaEntity.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-entity.model.js').CyberiaEntityModel} */
    const CyberiaEntity = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaEntity;
    return await CyberiaEntity.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-entity.model.js').CyberiaEntityModel} */
    const CyberiaEntity = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaEntity;
    if (req.params.id) return await CyberiaEntity.findByIdAndDelete(req.params.id);
    else return await CyberiaEntity.deleteMany();
  },
};

export { CyberiaEntityService };
