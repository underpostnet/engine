import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaGlobalMapCodeRegistryService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-global-map-code-registry.model.js').CyberiaGlobalMapCodeRegistryModel} */
    const CyberiaGlobalMapCodeRegistry =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaGlobalMapCodeRegistry;
    return await new CyberiaGlobalMapCodeRegistry(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-global-map-code-registry.model.js').CyberiaGlobalMapCodeRegistryModel} */
    const CyberiaGlobalMapCodeRegistry =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaGlobalMapCodeRegistry;
    if (req.params.id) return await CyberiaGlobalMapCodeRegistry.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaGlobalMapCodeRegistry.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaGlobalMapCodeRegistry.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-global-map-code-registry.model.js').CyberiaGlobalMapCodeRegistryModel} */
    const CyberiaGlobalMapCodeRegistry =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaGlobalMapCodeRegistry;
    return await CyberiaGlobalMapCodeRegistry.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-global-map-code-registry.model.js').CyberiaGlobalMapCodeRegistryModel} */
    const CyberiaGlobalMapCodeRegistry =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaGlobalMapCodeRegistry;
    if (req.params.id) return await CyberiaGlobalMapCodeRegistry.findByIdAndDelete(req.params.id);
    else return await CyberiaGlobalMapCodeRegistry.deleteMany();
  };
}

export { CyberiaGlobalMapCodeRegistryService };
