import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaEntityTypeDefaultService {
  // liveItemIds is the resolution key, so every itemId may belong to at most one
  // document across the collection. Reject writes that would reuse a live itemId
  // already claimed by another document (empty liveItemIds carry no key → exempt).
  static assertLiveItemIdsUnique = async (CyberiaEntityTypeDefault, liveItemIds, excludeId) => {
    const ids = [...new Set((liveItemIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    const query = { liveItemIds: { $in: ids } };
    if (excludeId) query._id = { $ne: excludeId };
    const conflict = await CyberiaEntityTypeDefault.findOne(query).select('entityType liveItemIds').lean();
    if (conflict) {
      const dup = ids.filter((id) => (conflict.liveItemIds || []).includes(id));
      throw new Error(
        `liveItemIds must be unique across entity-type defaults: ${dup.join(', ')} already used by entityType "${conflict.entityType}"`,
      );
    }
  };

  static post = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    await CyberiaEntityTypeDefaultService.assertLiveItemIdsUnique(CyberiaEntityTypeDefault, req.body?.liveItemIds);
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
    await CyberiaEntityTypeDefaultService.assertLiveItemIdsUnique(
      CyberiaEntityTypeDefault,
      req.body?.liveItemIds,
      req.params.id,
    );
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
