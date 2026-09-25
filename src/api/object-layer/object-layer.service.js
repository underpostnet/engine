/**
 * Object Layer API: the canonical store of the Object Layer domain.
 *
 * Reads name a definition by its cid or its document id. Publication goes through
 * {@link publishDefinition}; on a host that consumes Object Layer, `POST /canonical` is refused.
 * Authoring belongs to the host that authors: a host declares its Studio in `conf.server.json`
 * (`apiExtensions`), and that extension adds its routes and its own key resolution.
 *
 * @module src/api/object-layer/object-layer.service.js
 * @namespace ObjectLayerServiceModule
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { ObjectLayerRenderFramesDto } from '../object-layer-render-frames/object-layer-render-frames.model.js';
import { AtlasSpriteSheetStore } from '../atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { ObjectLayerDto, isObjectLayerCid } from './object-layer.model.js';
import { objectLayerIdentity } from './object-layer.identity.js';
import { isObjectLayerAuthority, objectLayerCache, publishDefinition } from './object-layer.publication.js';
import { purgeObjectLayers } from './object-layer.purge.js';
import { resolveLedgerBindings } from '../../server/domain/object-layer-resolver.js';
import { isProfileRef } from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CacheService } from '../../server/storage/cache.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';

const logger = loggerFactory(import.meta);

/**
 * The definition a key names: a canonical cid or a document id, or whatever the host's Studio
 * extension resolves (a Cyberia item label, on the Cyberia host).
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model.
 * @param {string} params.key
 * @param {Object} [params.options] - Router options; `options.extension.resolveKey` extends the lookup.
 * @param {Object} [params.select] - Projection.
 * @returns {Promise<Object|null>} A mongoose document.
 * @memberof ObjectLayerServiceModule
 */
export async function findObjectLayerByKey({ ObjectLayer, key, options, select }) {
  const read = async (query) => await (select ? query.select(select) : query);
  if (isObjectLayerCid(key)) return await read(ObjectLayer.findByCid(key));
  if (/^[0-9a-f]{24}$/i.test(String(key))) {
    const byId = await read(ObjectLayer.findById(key));
    if (byId) return byId;
  }
  const resolvedId = options?.extension?.resolveKey ? await options.extension.resolveKey(key, options) : null;
  return resolvedId ? await read(ObjectLayer.findById(resolvedId)) : null;
}

/**
 * Object Layer API handlers.
 * @memberof ObjectLayerServiceModule
 */
class ObjectLayerService {
  /**
   * POST `/canonical`: the authority stores a canonical definition as given, under any profile,
   * with no label and no storage refs. Idempotent: the same content answers with the same
   * identity.
   * @param {Object} req - Express request with body `{ schemaVersion?, profile, data }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{cid:string,contentHash:string,created:boolean}>}
   */
  static post = async (req, res, options) => {
    if (req.path !== '/canonical') throw new Error('Unknown Object Layer operation');
    if (!isObjectLayerAuthority(options))
      throw new Error('This host consumes Object Layer; publish at the Object Layer authority');
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const { schemaVersion, profile, data } = req.body ?? {};
    if (!isProfileRef(profile)) throw new Error('A canonical Object Layer needs a profile reference { id, version }');
    if (!data || typeof data !== 'object') throw new Error('A canonical Object Layer needs its data');
    const { cid } = objectLayerIdentity({ schemaVersion, profile, data });
    const existed = await ObjectLayer.exists({ cid, origin: 'canonical' });
    const stored = await publishDefinition({
      ObjectLayer,
      payload: { schemaVersion, profile, data, createdBy: req.auth.user._id },
      options,
    });
    return { cid: stored.cid, contentHash: stored.contentHash, created: !existed };
  };

  /**
   * PUT `/lifecycle/:id`: archives a definition (`{ archived: true }`) or offers it again. The
   * authority owns the lifecycle of published content; its owner or an admin changes it. The
   * definition stays stored under its cid either way.
   * @param {Object} req - Express request with body `{ archived: boolean }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The definition.
   */
  static lifecycle = async (req, res, options) => {
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const objectLayer = await findObjectLayerByKey({ ObjectLayer, key: req.params.id, options });
    if (!objectLayer) throw Object.assign(new Error(`No object layer for key: ${req.params.id}`), { status: 404 });
    if (objectLayer.origin !== 'draft' && !isObjectLayerAuthority(options))
      throw new Error(`The lifecycle of ${objectLayer.cid} belongs to the Object Layer authority`);
    assertOwnerOrAdmin(req.auth.user, objectLayer.createdBy);
    if (typeof req.body?.archived !== 'boolean') throw new Error('The lifecycle body is { archived: boolean }');
    const stored = await ObjectLayer.setArchived(objectLayer.cid, req.body.archived);
    await CacheService.invalidate(objectLayerCache(options));
    return stored;
  };

  /**
   * GET handler for retrieving object layers.
   *
   * Supports multiple sub-routes:
   * - `/render/:id` — The editor source of one definition: its render frames, colors and frame duration.
   * - `/metadata/:id` — One definition with its stats and timestamps, without its editor source.
   * - `/:id` — One definition by cid, document id or (through the host's extension) label; 404 when none.
   * - `/` — Get a paginated list of object layers.
   *
   * @async
   * @function get
   * @memberof CyberiaObjectLayerService.ObjectLayerService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The requested object layer data, list, or frame counts.
   * @throws {Error} If the requested object layer is not found.
   */
  static get = async (req, res, options) => {
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const findByKey = (key, query) => findObjectLayerByKey({ ObjectLayer, key, options, ...query });

    // GET /search-item-ids - item labels, by prefix (`q`, for type-ahead) or by exact ids
    // (`ids`, comma separated). Carries the item's type because that is what addresses its
    // sprite directory; an id alone cannot be previewed.
    if (req.path.startsWith('/search-item-ids')) {
      const q = (req.query.q || '').trim();
      const ids = String(req.query.ids || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (!q && ids.length === 0) return { items: [] };
      const query = ids.length
        ? { 'data.item.id': { $in: ids } }
        : // Escape regex special characters for safe partial matching
          { 'data.item.id': { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
      const results = await ObjectLayer.find(query, { 'data.item.id': 1, 'data.item.type': 1, _id: 0 })
        .limit(ids.length ? ids.length : 20)
        .lean();
      const byId = new Map(results.map((r) => [r.data.item.id, r.data.item.type || '']));
      return { items: [...byId].map(([id, type]) => ({ id, type })) };
    }

    // GET /render/:id - the editor source of one definition
    if (req.path.startsWith('/render/')) {
      const objectLayer = await findByKey(req.params.id, { select: { _id: 1, cid: 1 } });
      if (!objectLayer) throw new Error('ObjectLayer not found');
      const renderFrames = await DataBaseProviderService.getModel('ObjectLayerRenderFrames', options)
        .findOne({ objectLayerCid: objectLayer.cid })
        .select(ObjectLayerRenderFramesDto.select.getFull())
        .lean();
      return { _id: objectLayer._id, cid: objectLayer.cid, renderFrames };
    }

    // GET /metadata/:id - one definition, without its editor source
    if (req.path.startsWith('/metadata/')) {
      const objectLayer = await findByKey(req.params.id, { select: ObjectLayerDto.select.getMetadata() });
      if (!objectLayer) throw new Error('ObjectLayer not found');
      return objectLayer;
    }

    // GET /:id - the one definition a key names; the cross-domain contract `GET /v1/object-layer/:cid`
    const key = req.params.id || req.query.id;
    if (key && key !== 'undefined' && !['render', 'metadata'].includes(key)) {
      const objectLayer = await CacheService.getOrLoad(objectLayerCache(options), {
        identifier: key,
        load: async () => {
          const found = await findByKey(key, { select: ObjectLayerDto.select.get() });
          return found ? found.toJSON() : null;
        },
      });
      if (!objectLayer) throw Object.assign(new Error(`No object layer for key: ${key}`), { status: 404 });
      return objectLayer;
    }

    return await CacheService.getOrLoad(objectLayerCache(options), {
      identifier: 'list',
      variant: CacheService.variant(req.query),
      load: async () => {
        const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
        const [documents, total] = await Promise.all([
          ObjectLayer.find(query).sort(sort).limit(limit).skip(skip).select(ObjectLayerDto.select.get()),
          ObjectLayer.countDocuments(query),
        ]);
        const data = documents.map((document) => document.toJSON());
        return { data, total, page, totalPages: Math.ceil(total / limit) };
      },
    });
  };

  /**
   * DELETE `/purge/:id`: removes every record this host stores of one definition — the
   * definition, its render frames, its atlas and render files, its IPFS pin records, the pinned
   * content and its MFS paths, and what the Studio keeps for it. Not reversible.
   *
   * The body carries the cid the caller means (`{ cid }`): the purge runs only when it is the
   * cid the key resolves to, so a stale row can never destroy another definition.
   * @param {Object} req - Express request with body `{ cid }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<import('./object-layer.purge.js').PurgeReport>}
   */
  static purge = async (req, res, options) => {
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const objectLayer = await findObjectLayerByKey({ ObjectLayer, key: req.params.id, options });
    if (!objectLayer) throw Object.assign(new Error(`No object layer for key: ${req.params.id}`), { status: 404 });
    if (req.body?.cid !== objectLayer.cid) throw new Error(`A purge names the cid it removes: ${objectLayer.cid}`);
    const report = await purgeObjectLayers({ options, filter: { _id: objectLayer._id } });
    if (report.kept.length > 0)
      throw new Error(`ObjectLayer ${objectLayer.cid} is registered in ItemLedger and cannot be purged`);
    return report;
  };

  /**
   * DELETE `/:id` (one definition, by its owner or an admin) or `/` (every one this host may
   * delete, by an admin).
   *
   * A canonical definition is published and immutable: it is never deleted through the API, it
   * is archived. A draft or a cache copy goes, with its render frames and atlas; the host's
   * Studio extension removes what it keeps for the definition.
   * Nothing here touches IPFS: pins belong to publication.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static delete = async (req, res, options) => {
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);

    if (!req.params.id) {
      const removable = await ObjectLayer.find({ origin: { $ne: 'canonical' } }, { _id: 1 }).lean();
      let deletedCount = 0;
      for (const { _id } of removable) {
        try {
          await ObjectLayerService.delete({ params: { id: String(_id) }, auth: req.auth }, res, options);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to delete ObjectLayer ${_id} during bulk delete: ${error.message}`);
        }
      }
      return { deletedCount };
    }

    const objectLayer = await ObjectLayer.findById(req.params.id);
    if (!objectLayer) throw new Error('ObjectLayer not found');
    assertOwnerOrAdmin(req.auth.user, objectLayer.createdBy);
    if (objectLayer.origin === 'canonical')
      throw new Error(`ObjectLayer ${objectLayer.cid} is published and immutable; archive it instead`);
    // A registered definition is a token type's content: it stays. The ledger is asked where it
    // lives; an unreachable ledger fails the delete.
    if ((await resolveLedgerBindings(objectLayer.cid, options)).length > 0)
      throw new Error(`ObjectLayer ${objectLayer.cid} is registered in ItemLedger and cannot be deleted`);

    await options.extension?.beforeDelete?.(objectLayer, options);
    await AtlasSpriteSheetStore.purge({ objectLayerCids: [objectLayer.cid], options });
    await ObjectLayerRenderFrames.deleteOne({ objectLayerCid: objectLayer.cid });
    const deleted = await ObjectLayer.findByIdAndDelete(objectLayer._id);
    await CacheService.invalidate(objectLayerCache(options));
    logger.info(`ObjectLayer ${objectLayer.cid} (${objectLayer.origin}) deleted`);
    return deleted;
  };
}

export { ObjectLayerService };
