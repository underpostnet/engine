import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

const CyberiaMapService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;
    if (req.auth && req.auth.user) req.body.creator = req.auth.user._id;
    return await new CyberiaMap(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;
    const populateCreator = { path: 'creator', model: 'User', select: '_id username' };
    if (req.params.id) return await CyberiaMap.findById(req.params.id).populate(populateCreator);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaMap.find(query).sort(sort).limit(limit).skip(skip).populate(populateCreator),
      CyberiaMap.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;
    return await CyberiaMap.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;
    if (req.params.id) return await CyberiaMap.findByIdAndDelete(req.params.id);
    else return await CyberiaMap.deleteMany();
  },
};

export { CyberiaMapService };
