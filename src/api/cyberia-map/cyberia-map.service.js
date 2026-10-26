import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CacheService } from '../../server/storage/cache.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';
import { CyberiaMapDto } from './cyberia-map.model.js';
import { mapContext } from '../../projects/cyberia/content/foundation-context.js';
import { loadSagaAssociations, withSagaFilter } from '../../projects/cyberia/saga/saga-associations.js';
import { mapSpatialDefect } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { registryModels, registryTransaction } from '../../projects/cyberia/instance/map-registry.js';
import {
  PREVIEW_FIELDS,
  refreshMapMedia,
  refreshMapPreview,
  renderMapPreviewPng,
} from '../../projects/cyberia/instance/map-preview-generator.js';
import { loggerFactory } from '../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/** Map lists and reads by code; every map write invalidates them. */
const mapCache = (options) => CacheService.namespace(options, 'cyberia-map');

/** The media of a new map revision: its preview is drawn after the commit. */
const pendingMedia = (revision) => ({ revision, status: 'pending', error: '', at: new Date() });

/** Draws the preview of the revision a write stored, after the response: its media turns ready or failed. */
const drawAfterResponse = (filter, options) =>
  void refreshMapMedia(filter, options).catch((error) => logger.error(`map preview: ${error.message}`));

/** The fields a map write never takes from a client: the server draws the preview and owns its media. */
const SERVER_FIELDS = Object.freeze(['creator', 'revision', 'preview', 'media']);

const clientChanges = (body) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => !SERVER_FIELDS.includes(key)));

/** Deletes a File once no map names it as its thumbnail or its preview. */
const releaseFile = async (fileId, options) => {
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  if (fileId && !(await CyberiaMap.exists({ $or: [{ thumbnail: fileId }, { preview: fileId }] })))
    await DataBaseProviderService.getModel('File', options).findByIdAndDelete(fileId);
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
        new CyberiaMap({ ...clientChanges(req.body), creator: req.auth.user._id, media: pendingMedia(1) }).save({
          session,
        }),
      ));
    } catch (error) {
      if (error.code === 11000 && (error.keyPattern?.code || error.keyValue?.code !== undefined))
        throw Object.assign(new Error(`Map code "${req.body.code}" already exists. Enter a different code.`), {
          status: 409,
        });
      throw error;
    }
    await CacheService.invalidate(mapCache(options));
    drawAfterResponse({ _id: map._id }, options);
    return await CyberiaMap.findById(map._id);
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
    // The revision only moves forward: a save names the revision it read.
    const { revision } = req.body;
    const changes = clientChanges(req.body);
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
    const { value: updated } = await registryTransaction(registryModels(options), async (session) => {
      const saved = await CyberiaMap.findOneAndUpdate(
        { _id: req.params.id, updatedAt: map.updatedAt },
        { $set: { ...changes, media: pendingMedia(map.revision + 1) }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true, session },
      );
      if (!saved)
        throw Object.assign(new Error(`Map ${map.code} changed while saving: reload it before saving`), {
          status: 409,
        });
      return saved;
    });
    if ('thumbnail' in changes && map.thumbnail && String(changes.thumbnail) !== String(map.thumbnail))
      await releaseFile(map.thumbnail, options);
    await CacheService.invalidate(mapCache(options));
    drawAfterResponse({ _id: updated._id }, options);
    return await CyberiaMap.findById(updated._id);
  };
  /** GET /:id/media - the media of the revision the map is at now, and its preview. Read-only. */
  static readMedia = async (req, res, options) => {
    const map = await DataBaseProviderService.getModel('CyberiaMap', options)
      .findById(req.params.id, { media: 1, preview: 1 })
      .lean();
    if (!map) throw Object.assign(new Error('map not found'), { status: 404 });
    return { media: map.media ?? null, preview: map.preview ? String(map.preview) : null };
  };
  /**
   * GET /:code/preview - the preview of a stored map: its stored picture, else the picture of the
   * revision it is at, which is stored as its preview. Null when the map draws nothing.
   */
  static preview = async (req, res, options) => {
    const map = await DataBaseProviderService.getModel('CyberiaMap', options)
      .findOne({ code: req.params.code })
      .select(PREVIEW_FIELDS)
      .lean();
    if (!map) throw Object.assign(new Error(`map ${req.params.code} not found`), { status: 404 });
    const stored = map.preview && (await DataBaseProviderService.getModel('File', options).findById(map.preview));
    return stored?.data ?? (await refreshMapPreview(map, options));
  };
  /** POST /draft-preview - draws the grid and the entities an editor holds, saved or not; stores nothing. Null when it draws nothing. */
  static draftPreview = async (req, res, options) => {
    const { gridX, gridY, entities = [] } = req.body;
    if (![gridX, gridY].every((n) => Number.isInteger(n) && n > 0) || !Array.isArray(entities))
      throw Object.assign(new Error('A draft preview takes a grid of positive integer sides and a list of entities'), {
        status: 400,
      });
    return await renderMapPreviewPng({ gridX, gridY, entities }, { options });
  };
  /** POST /:id/media - draws the preview of the revision the map is at now, and answers its media and preview. */
  static media = async (req, res, options) => {
    const map = await DataBaseProviderService.getModel('CyberiaMap', options).findById(req.params.id, { creator: 1 });
    if (!map) throw Object.assign(new Error('map not found'), { status: 404 });
    assertOwnerOrAdmin(req.auth.user, map.creator);
    return await refreshMapMedia({ _id: map._id }, options);
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

export { CyberiaMapService, mapCache, pendingMedia };
