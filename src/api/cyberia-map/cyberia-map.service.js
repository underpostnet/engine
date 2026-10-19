import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CacheService } from '../../server/storage/cache.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';
import { CyberiaMapDto } from './cyberia-map.model.js';
import { mapContext } from '../../projects/cyberia/content/foundation-context.js';
import { loadSagaAssociations, withSagaFilter } from '../../projects/cyberia/saga/saga-associations.js';
import { CyberiaEntityTypeDefaultService } from '../cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { mapSpatialDefect } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { registryModels, registryTransaction } from '../../projects/cyberia/instance/map-registry.js';

const logger = loggerFactory(import.meta);

/** Map lists and reads by code; every map write invalidates them. */
const mapCache = (options) => CacheService.namespace(options, 'cyberia-map');

/**
 * Links every instance that runs the map to the entity-type defaults its maps place, so a default
 * reaches the world where it is placed. The map is already saved: a failed link is logged.
 */
const linkPlacedDefaults = async (mapCode, options) => {
  const instances = await DataBaseProviderService.getModel('CyberiaInstance', options)
    .find({ cyberiaMapCodes: mapCode }, { code: 1 })
    .lean();
  for (const { code } of instances) {
    try {
      const { linked } = await CyberiaEntityTypeDefaultService.linkPlacedDefaults({ instanceCode: code }, options);
      if (linked.length > 0) logger.info('Linked placed entity-type defaults', { instanceCode: code, mapCode, linked });
    } catch (error) {
      logger.warn('Could not link placed entity-type defaults', { instanceCode: code, mapCode, error: error.message });
    }
  }
};

class CyberiaMapService {
  /** GET /context/:code - the foundation context of a map against its stored entities. Read-only. */
  static context = async (req, res, options) => {
    const code = req.params.code;
    const map = await DataBaseProviderService.getModel('CyberiaMap', options).findOne({ code }).lean();
    const instances = await DataBaseProviderService.getModel('CyberiaInstance', options)
      .find({ $or: [{ 'portals.sourceMapCode': code }, { 'portals.targetMapCode': code }] }, { code: 1, portals: 1 })
      .lean();
    const sagas = (await loadSagaAssociations(options)).maps[code] ?? [];
    return { ...mapContext({ code, map: map ?? {}, instances }), sagas };
  };
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-map.model.js').CyberiaMapModel} */
    const CyberiaMap = DataBaseProviderService.getModel("CyberiaMap", options);
    const defect = mapSpatialDefect(req.body);
    if (defect) throw Object.assign(new Error(defect), { status: 400 });
    let map;
    try {
      ({ value: map } = await registryTransaction(registryModels(options), (session) =>
        new CyberiaMap({ ...req.body, creator: req.auth.user._id }).save({ session }),
      ));
    } catch (error) {
      if (error.code === 11000 && (error.keyPattern?.code || error.keyValue?.code !== undefined))
        throw Object.assign(new Error(`Map code "${req.body.code}" already exists. Enter a different code.`), {
          status: 409,
        });
      throw error;
    }
    await CacheService.invalidate(mapCache(options));
    await linkPlacedDefaults(map.code, options);
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
    const params = await withSagaFilter(req.query, { family: 'maps', field: 'code' }, options);
    return await CacheService.getOrLoad(mapCache(options), {
      identifier: 'list',
      variant: CacheService.variant(params),
      load: async () => {
        const { query, sort, skip, limit, page } = DataQuery.parse(params);
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
    // The owner is set once, by the write that created the map; the revision only moves forward.
    const { creator, revision, ...changes } = req.body;
    if (revision !== map.revision)
      throw Object.assign(
        new Error(`Map ${map.code} is at revision ${map.revision}, not ${revision}: reload it before saving`),
        { status: 409 },
      );
    // The registry and every instance name a map by its code: a copy takes a new one.
    if (changes.code !== undefined && changes.code !== map.code)
      throw Object.assign(new Error(`The code of map ${map.code} never changes; clone the map instead`), {
        status: 400,
      });
    const candidate = new CyberiaMap({ ...map.toObject(), ...changes });
    const defect = mapSpatialDefect(candidate);
    if (defect) throw Object.assign(new Error(defect), { status: 400 });
    await candidate.validate();
    const File = DataBaseProviderService.getModel("File", options);
    const { value: updated } = await registryTransaction(registryModels(options), async (session) => {
      const saved = await CyberiaMap.findOneAndUpdate(
        { _id: req.params.id, updatedAt: map.updatedAt },
        { $set: changes, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true, session },
      );
      if (!saved)
        throw Object.assign(new Error(`Map ${map.code} changed while saving: reload it before saving`), {
          status: 409,
        });
      return saved;
    });
    if (changes.thumbnail && map.thumbnail && String(changes.thumbnail) !== String(map.thumbnail)) {
      await File.findByIdAndDelete(map.thumbnail);
    }
    if (changes.preview && map.preview && String(changes.preview) !== String(map.preview)) {
      await File.findByIdAndDelete(map.preview);
    }
    await CacheService.invalidate(mapCache(options));
    await linkPlacedDefaults(updated.code, options);
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
      ({ value: removed } = await registryTransaction(registryModels(options), (session) =>
        CyberiaMap.findByIdAndDelete(req.params.id, { session }),
      ));
      if (map.thumbnail) await File.findByIdAndDelete(map.thumbnail);
      if (map.preview) await File.findByIdAndDelete(map.preview);
    } else
      ({ value: removed } = await registryTransaction(registryModels(options), (session) =>
        CyberiaMap.deleteMany({}, { session }),
      ));
    await CacheService.invalidate(mapCache(options));
    return removed;
  };
}

export { CyberiaMapService, mapCache };
