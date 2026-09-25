import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';

const logger = loggerFactory(import.meta);

class CyberiaMapService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    return await new CyberiaMap({ ...req.body, creator: req.auth.user._id }).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    const populateCreator = { path: 'creator', model: 'User', select: '_id username' };

    // GET /search-codes?q=<partial> - Fast partial match search on code
    if (req.path?.startsWith('/search-codes')) {
      const q = (req.query.q || '').trim();
      if (!q) return { codes: [] };
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const results = await CyberiaMap.find({ code: { $regex: escaped, $options: 'i' } }, { code: 1, _id: 0 })
        .limit(20)
        .lean();
      const codes = [...new Set(results.map((r) => r.code).filter(Boolean))];
      return { codes };
    }

    // Maps are addressed by code, the key the engine navigates by.
    if (req.params.id)
      return await CyberiaMap.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).populate(populateCreator);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaMap.find(query).sort(sort).limit(limit).skip(skip).populate(populateCreator),
      CyberiaMap.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    const map = await CyberiaMap.findById(req.params.id);
    if (!map) throw new Error('map not found');
    assertOwnerOrAdmin(req.auth.user, map.creator);
    // The owner is set once, by the write that created the map.
    const { creator, ...changes } = req.body;
    const candidate = new CyberiaMap({ ...map.toObject(), ...changes });
    await candidate.validate();
    const File = DataBaseProviderService.getModel("File", options);
    if (changes.thumbnail && map.thumbnail && String(changes.thumbnail) !== String(map.thumbnail)) {
      await File.findByIdAndDelete(map.thumbnail);
    }
    if (changes.preview && map.preview && String(changes.preview) !== String(map.preview)) {
      await File.findByIdAndDelete(map.preview);
    }
    return await CyberiaMap.findByIdAndUpdate(req.params.id, changes, { returnDocument: 'after', runValidators: true });
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    if (req.params.id) {
      const map = await CyberiaMap.findById(req.params.id);
      if (!map) throw new Error('map not found');
      assertOwnerOrAdmin(req.auth.user, map.creator);
      const File = DataBaseProviderService.getModel("File", options);
      if (map.thumbnail) await File.findByIdAndDelete(map.thumbnail);
      if (map.preview) await File.findByIdAndDelete(map.preview);
      return await CyberiaMap.findByIdAndDelete(req.params.id);
    } else return await CyberiaMap.deleteMany();
  };
}

export { CyberiaMapService };
