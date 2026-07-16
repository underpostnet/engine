import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaMapService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    if (req.auth && req.auth.user) req.body.creator = req.auth.user._id;
    return await new CyberiaMap(req.body).save();
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

    if (req.params.id) return await CyberiaMap.findById(req.params.id).populate(populateCreator);

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
    if (req.auth.user.role !== 'admin' && String(map.creator) !== String(req.auth.user._id))
      throw new Error('insufficient permission');
    const File = DataBaseProviderService.getModel("File", options);
    if (req.body.thumbnail && map.thumbnail && String(req.body.thumbnail) !== String(map.thumbnail)) {
      await File.findByIdAndDelete(map.thumbnail);
    }
    if (req.body.preview && map.preview && String(req.body.preview) !== String(map.preview)) {
      await File.findByIdAndDelete(map.preview);
    }
    return await CyberiaMap.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    if (req.params.id) {
      const map = await CyberiaMap.findById(req.params.id);
      if (!map) throw new Error('map not found');
      if (req.auth.user.role !== 'admin' && String(map.creator) !== String(req.auth.user._id))
        throw new Error('insufficient permission');
      const File = DataBaseProviderService.getModel("File", options);
      if (map.thumbnail) await File.findByIdAndDelete(map.thumbnail);
      if (map.preview) await File.findByIdAndDelete(map.preview);
      return await CyberiaMap.findByIdAndDelete(req.params.id);
    } else return await CyberiaMap.deleteMany();
  };
}

export { CyberiaMapService };
