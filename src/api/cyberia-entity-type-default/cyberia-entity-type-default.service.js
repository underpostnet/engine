import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaEntityTypeDefaultService {
  // No per-itemId uniqueness: resolution is by subset containment (most-specific
  // match wins), so the same itemId may appear in many documents — e.g.
  // [purple, atlas_pistol_mk2]→hostile alongside [purple]→passive. See the model.

  static post = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    return await new CyberiaEntityTypeDefault(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    if (req.params.id) return await CyberiaEntityTypeDefault.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaEntityTypeDefault.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaEntityTypeDefault.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    return await CyberiaEntityTypeDefault.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    if (req.params.id) return await CyberiaEntityTypeDefault.findByIdAndDelete(req.params.id);
    else return await CyberiaEntityTypeDefault.deleteMany();
  };
}

export { CyberiaEntityTypeDefaultService };
