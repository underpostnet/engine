import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CacheService } from '../../server/storage/cache.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';
import { CyberiaMapDto } from './cyberia-map.model.js';

const logger = loggerFactory(import.meta);

/** Map lists and reads by code; every map write invalidates them. */
const mapCache = (options) => CacheService.namespace(options, 'cyberia-map');

class CyberiaMapService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    const map = await new CyberiaMap({ ...req.body, creator: req.auth.user._id }).save();
    await CacheService.invalidate(mapCache(options));
    return map;
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
      return await CacheService.getOrLoad(mapCache(options), {
        identifier: req.params.id,
        load: async () => {
          const map = await CyberiaMap.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).populate(
            populateCreator,
          );
          return map ? map.toJSON() : null;
        },
      });

    // A list row is a summary: the entities of a map come with the map, by code.
    return await CacheService.getOrLoad(mapCache(options), {
      identifier: 'list',
      variant: CacheService.variant(req.query),
      load: async () => {
        const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
        const [documents, total] = await Promise.all([
          CyberiaMap.find(query)
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .select(CyberiaMapDto.select.list())
            .populate(populateCreator),
          CyberiaMap.countDocuments(query),
        ]);
        const data = documents.map((document) => document.toJSON());
        return { data, total, page, totalPages: Math.ceil(total / limit) };
      },
    });
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
    const updated = await CyberiaMap.findByIdAndUpdate(req.params.id, changes, {
      returnDocument: 'after',
      runValidators: true,
    });
    await CacheService.invalidate(mapCache(options));
    return updated;
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    let removed;
    if (req.params.id) {
      const map = await CyberiaMap.findById(req.params.id);
      if (!map) throw new Error('map not found');
      assertOwnerOrAdmin(req.auth.user, map.creator);
      const File = DataBaseProviderService.getModel("File", options);
      if (map.thumbnail) await File.findByIdAndDelete(map.thumbnail);
      if (map.preview) await File.findByIdAndDelete(map.preview);
      removed = await CyberiaMap.findByIdAndDelete(req.params.id);
    } else removed = await CyberiaMap.deleteMany();
    await CacheService.invalidate(mapCache(options));
    return removed;
  };
}

export { CyberiaMapService };
