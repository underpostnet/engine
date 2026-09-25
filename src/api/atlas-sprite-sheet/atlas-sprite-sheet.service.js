import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { AtlasSpriteSheetDto } from './atlas-sprite-sheet.model.js';
import { IpfsClient } from '../ipfs/ipfs.client.js';
import { removePinRecordsAndUnpin } from '../ipfs/ipfs.service.js';
import { AtlasSpriteSheetStore, atlasMfsPaths } from './atlas-sprite-sheet.store.js';
import { AtlasSpriteSheetGenerator, IDLE_PREVIEW_SIZE } from './atlas-sprite-sheet.generator.js';
import {
  MAX_CANONICAL_BYTES,
  isObjectLayerCid,
  parseIdentityJson,
  payloadCid,
  renderMetadataCid,
} from '../object-layer/object-layer.identity.js';
import { objectLayerCache } from '../object-layer/object-layer.publication.js';
import { CACHE_POLICY, CacheService } from '../../server/storage/cache.js';

const logger = loggerFactory(import.meta);

/** A definition never changes, so every answer derived from its render is cacheable for good. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** A label can move to another render: a client keeps its copy and revalidates it by ETag. */
const REVALIDATE = 'public, no-cache';
/** Everything derived from a render is addressed by the render's cid: kept for good. */
const renderCache = (options) => CacheService.namespace(options, 'atlas-sprite-sheet', CACHE_POLICY.immutable);
/** Frame duration of a render whose layout names none, in milliseconds. */
const DEFAULT_FRAME_DURATION = 100;
const failure = (status, message) => Object.assign(new Error(message), { status });

/**
 * Removes one atlas: the local materialization of a render, and every File render it owns that
 * no other atlas holds. The render itself is the definition's: its pins go only when the caller
 * passes `render`, a render contract no remaining definition names.
 *
 * @param {Object} params
 * @param {Object} params.atlasDoc - The AtlasSpriteSheet document.
 * @param {Object} params.options - Router options ({ host, path }).
 * @param {{cid: string, metadataCid: string}} [params.render] - Render contract whose pins and MFS
 *   entries go too.
 * @returns {Promise<void>}
 */
export const purgeAtlasDoc = async ({ atlasDoc, options, render = null }) => {
  if (render) {
    const mfsPaths = atlasMfsPaths(atlasDoc.metadata?.itemKey);
    for (const [cid, mfsPath] of [
      [render.cid, mfsPaths.png],
      [render.metadataCid, mfsPaths.metadata],
    ]) {
      if (!cid) continue;
      try {
        await removePinRecordsAndUnpin(cid, options);
        await IpfsClient.removeMfsPath(mfsPath);
        logger.info(`Cleaned up IPFS CID ${cid} of AtlasSpriteSheet ${atlasDoc._id}`);
      } catch (ipfsErr) {
        logger.warn(`Failed to clean up IPFS CID ${cid}: ${ipfsErr.message}`);
      }
    }
  }
  await AtlasSpriteSheetStore.purge({ objectLayerCids: [atlasDoc.objectLayerCid], options });
};

/* The bytes of a stored File. Hydrated, not lean: a lean read hands back a BSON Binary. */
const storedBytes = async (fileId, options) => {
  const file = fileId ? await DataBaseProviderService.getModel('File', options).findById(fileId, { data: 1 }) : null;
  return file?.data ? Buffer.from(file.data) : null;
};

/**
 * The bytes of a render File. Its id is derived from its bytes, so they are kept for good.
 * @param {string} fileId - Render File id.
 * @param {Object} options - Router options.
 * @returns {Promise<Buffer|null>}
 */
export const renderFileBytes = (fileId, options) =>
  CacheService.getOrLoad(renderCache(options), {
    identifier: `file:${fileId}`,
    binary: true,
    load: () => storedBytes(fileId, options),
  });

/**
 * The definition an item label runs on. A label is no identity: the host that binds labels to
 * definitions resolves it (`options.extension.resolveKey`) to the cid of the definition it binds.
 * @param {string} itemKey - Item label.
 * @param {Object} options - Router options.
 * @returns {Promise<string>} Canonical Object Layer CID.
 * @throws {Error} `status` 404 when no definition is bound to the label.
 */
const objectLayerCidOfLabel = async (itemKey, options) => {
  const cid = options?.extension?.resolveKey ? await options.extension.resolveKey(itemKey, options) : null;
  if (!cid) throw failure(404, `No definition bound to label: ${itemKey}`);
  return cid;
};

class AtlasSpriteSheetService {
  /**
   * One render File of the atlas an item label runs on, by the atlas field that holds it. The
   * label resolves until the next content write; the File bytes are kept for good. The File id
   * is the ETag, so a client revalidates its copy without a download.
   * @param {{itemKey: string, field: string, role: string}} params - `role` names the render: `primary`, `idle`.
   * @param {import('express').Response} res
   * @param {Object} options - Router options.
   * @returns {Promise<{buffer: Buffer, mimetype: string, name: string, etag: string}>}
   * @throws {Error} `status` 404 when the label runs on no such render.
   */
  static labelRender = async ({ itemKey, field, role }, res, options) => {
    const { fileId } = await CacheService.getOrLoad(objectLayerCache(options), {
      identifier: `${field}:${itemKey}`,
      load: async () => {
        const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
        const objectLayerCid = await objectLayerCidOfLabel(itemKey, options);
        const atlasDoc = await AtlasSpriteSheet.findOne({ objectLayerCid }, { [field]: 1 }).lean();
        return { fileId: atlasDoc?.[field] ? String(atlasDoc[field]) : null };
      },
    });
    const buffer = fileId ? await renderFileBytes(fileId, options) : null;
    if (!buffer) throw failure(404, `No ${role} render stored for label: ${itemKey}`);
    res.set('Cache-Control', REVALIDATE);
    return { buffer, mimetype: 'image/png', name: `${itemKey}-${role}.png`, etag: fileId };
  };

  // The primary render: the client runtime pairs it with GET /metadata/:itemKey, which describes it.
  static blob = (req, res, options) =>
    AtlasSpriteSheetService.labelRender(
      { itemKey: req.params.itemKey, field: 'fileId', role: 'primary' },
      res,
      options,
    );

  static idlePreview = async (req, res, options) => {
    const { key } = req.params;
    if (!isObjectLayerCid(key))
      return await AtlasSpriteSheetService.labelRender(
        { itemKey: key, field: 'idlePreviewFileId', role: 'idle' },
        res,
        options,
      );
    const still = await AtlasSpriteSheetService.definitionIdlePreview(key, options);
    res.set('Cache-Control', IMMUTABLE);
    return still;
  };

  /**
   * The render cids a definition names, `data.render`, or null when it names none yet, which is
   * valid content.
   * @param {string} cid - Canonical Object Layer cid.
   * @param {Object} options - Router options.
   * @returns {Promise<{renderCid: string, metadataCid: string}|null>}
   * @throws {Error} `status` 404 for an unknown definition.
   */
  static renderRefsOf = async (cid, options) => {
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    const definition = await ObjectLayer.findByCid(cid).select({ 'data.render': 1 }).lean();
    if (!definition) throw failure(404, `No object layer for cid: ${cid}`);
    const { cid: renderCid, metadataCid } = definition.data?.render ?? {};
    return renderCid && metadataCid ? { renderCid, metadataCid } : null;
  };

  /**
   * The render a definition names: the primary render (`cid`) and its layout (`metadataCid`).
   * Read from this host's atlas when its bytes are the ones the cids name, else from IPFS, so
   * every host that holds the definition can serve it. Both are kept for good by cid.
   * @param {string} cid - Canonical Object Layer cid.
   * @param {Object} options - Router options.
   * @param {{png?: boolean}} [read] - `png: false` reads the layout only.
   * @returns {Promise<{renderCid: string, metadataCid: string, png: Buffer|null, layout: Object}|null>} Null when the
   *   definition names no render yet.
   * @throws {Error} `status` 404 for an unknown definition, 503 when neither this host nor IPFS holds it.
   */
  static renderOf = async (cid, options, { png: readPng = true } = {}) => {
    const refs = await AtlasSpriteSheetService.renderRefsOf(cid, options);
    if (!refs) return null;
    const { renderCid, metadataCid } = refs;
    let atlasRead;
    const materialized = () =>
      (atlasRead ??= DataBaseProviderService.getModel('AtlasSpriteSheet', options)
        .findOne({ objectLayerCid: cid }, { fileId: 1, metadata: 1 })
        .lean()
        .exec());
    const [png, layout] = await Promise.all([
      readPng
        ? CacheService.getOrLoad(renderCache(options), {
            identifier: `png:${renderCid}`,
            binary: true,
            load: async () => {
              const local = await storedBytes((await materialized())?.fileId, options);
              // A payload over one block never pins under a raw CID, so it is not the named render.
              const named = local && local.length <= MAX_CANONICAL_BYTES && payloadCid(local) === renderCid;
              return named ? local : await IpfsClient.getFromIpfs(renderCid);
            },
          })
        : null,
      CacheService.getOrLoad(renderCache(options), {
        identifier: `layout:${metadataCid}`,
        load: async () => {
          const local = (await materialized())?.metadata;
          if (local && renderMetadataCid(local) === metadataCid) return local;
          const raw = await IpfsClient.getFromIpfs(metadataCid);
          return raw ? parseIdentityJson(raw.toString('utf8')) : null;
        },
      }),
    ]);
    if (!layout || (readPng && !png)) throw failure(503, `Render ${renderCid} of ${cid} is unavailable`);
    return { renderCid, metadataCid, png, layout };
  };

  /**
   * One image derived from a definition's render, kept under the render's cid once produced.
   * @param {string} cid - Canonical Object Layer cid.
   * @param {Object} options - Router options.
   * @param {string} kind - What is derived: `idle-<size>`, `upscaled`, `animation:<direction>`.
   * @param {(render: {renderCid: string, png: Buffer, layout: Object}) => Promise<Buffer|null>} produce
   * @returns {Promise<Buffer|null>} Null when the render has nothing to derive.
   * @throws {Error} `status` 404 when the definition names no render.
   */
  static derived = async (cid, options, kind, produce) => {
    const refs = await AtlasSpriteSheetService.renderRefsOf(cid, options);
    if (!refs) throw failure(404, `Object layer ${cid} names no render`);
    return await CacheService.getOrLoad(renderCache(options), {
      identifier: `${kind}:${refs.renderCid}`,
      binary: true,
      load: async () => await produce(await AtlasSpriteSheetService.renderOf(cid, options)),
    });
  };

  /**
   * The idle preview of the definition a cid names: a pure function of its render, kept for good.
   * @param {string} cid - Canonical Object Layer cid.
   * @param {Object} options - Router options.
   * @returns {Promise<{buffer: Buffer, mimetype: string, name: string}>}
   */
  static definitionIdlePreview = async (cid, options) => {
    const still = await AtlasSpriteSheetService.derived(cid, options, `idle-${IDLE_PREVIEW_SIZE}`, (render) =>
      AtlasSpriteSheetGenerator.idlePreviewFromRender(render.png, render.layout),
    );
    if (!still) throw failure(404, `The render of ${cid} has no idle frame`);
    return { buffer: still, mimetype: 'image/png', name: `${cid}-idle.png` };
  };

  /**
   * GET `/frame-counts/:cid`: frames per direction code, and the frame duration, of a definition's
   * render. A definition that names no render yet has no frame in any direction.
   */
  static frameCounts = async (req, res, options) => {
    const render = await AtlasSpriteSheetService.renderOf(req.params.cid, options, { png: false });
    res.set('Cache-Control', IMMUTABLE);
    return {
      frameDuration: Number(render?.layout.frame_duration) || DEFAULT_FRAME_DURATION,
      frameCounts: AtlasSpriteSheetGenerator.frameCounts(render?.layout),
    };
  };

  /**
   * GET `/layout/:cid`: the layout of the render a definition names, and the cids it is pinned
   * under. The same answer on every host that holds the definition.
   */
  static layout = async (req, res, options) => {
    const render = await AtlasSpriteSheetService.renderOf(req.params.cid, options, { png: false });
    if (!render) throw failure(404, `Object layer ${req.params.cid} names no render`);
    res.set('Cache-Control', IMMUTABLE);
    return { renderCid: render.renderCid, metadataCid: render.metadataCid, layout: render.layout };
  };

  /**
   * GET `/render/:cid`: the primary render a definition names, as pinned; `/render/:cid/upscaled`:
   * the upscaled render derived from it.
   */
  static definitionRender = async (req, res, options) => {
    const { cid, scale } = req.params;
    if (scale === undefined) {
      const render = await AtlasSpriteSheetService.renderOf(cid, options);
      if (!render) throw failure(404, `Object layer ${cid} names no render`);
      res.set('Cache-Control', IMMUTABLE);
      return { buffer: render.png, mimetype: 'image/png', name: `${cid}-render.png` };
    }
    if (scale !== 'upscaled') throw failure(404, `No ${scale} render of ${cid}`);
    const buffer = await AtlasSpriteSheetService.derived(
      cid,
      options,
      'upscaled',
      async (render) => (await AtlasSpriteSheetGenerator.upscaledFromRender(render.png, render.layout)) ?? render.png,
    );
    res.set('Cache-Control', IMMUTABLE);
    return { buffer, mimetype: 'image/png', name: `${cid}-render-upscaled.png` };
  };

  /** GET `/animation/:cid/:directionCode`: the animated WebP of one direction of a definition's render. */
  static animation = async (req, res, options) => {
    const { cid, directionCode } = req.params;
    const buffer = await AtlasSpriteSheetService.derived(cid, options, `animation:${directionCode}`, (render) =>
      AtlasSpriteSheetGenerator.animationFromRender(
        render.png,
        render.layout,
        directionCode,
        Number(render.layout.frame_duration) || DEFAULT_FRAME_DURATION,
      ),
    );
    if (!buffer) throw failure(404, `The render of ${cid} has no frame for direction ${directionCode}`);
    res.set('Cache-Control', IMMUTABLE);
    return { buffer, mimetype: 'image/webp', name: `${cid}-${directionCode}.webp` };
  };
  static post = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    return await new AtlasSpriteSheet(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    if (req.params.id)
      return await AtlasSpriteSheet.findById(req.params.id)
        .select(AtlasSpriteSheetDto.select.get())
        .populate('fileId', '-data');

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      AtlasSpriteSheet.find(query)
        .select(AtlasSpriteSheetDto.select.get())
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate('fileId', '-data'),
      AtlasSpriteSheet.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  // The layout of the primary render the runtime downloads for a label: fetched once per label,
  // then the PNG by GET /blob/:itemKey.
  static getMetadata = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);

    if (req.params.itemKey) {
      const objectLayerCid = await objectLayerCidOfLabel(req.params.itemKey, options);
      const doc = await AtlasSpriteSheet.findOne({ objectLayerCid })
        .select(AtlasSpriteSheetDto.select.getMetadataOnly())
        .lean();
      if (!doc) throw failure(404, `The atlas bound to label ${req.params.itemKey} is not stored on this host`);
      return doc;
    }

    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      AtlasSpriteSheet.find(query)
        .select(AtlasSpriteSheetDto.select.getMetadataOnly())
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .lean(),
      AtlasSpriteSheet.countDocuments(query),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };
  static put = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const atlasDoc = await AtlasSpriteSheet.findByIdAndUpdate(req.params.id, req.body);
    await CacheService.invalidate(objectLayerCache(options));
    return atlasDoc;
  };
  static delete = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);

    if (req.params.id) {
      const atlasDoc = await AtlasSpriteSheet.findById(req.params.id);
      if (!atlasDoc) return null;
      await purgeAtlasDoc({ atlasDoc, options });
      return atlasDoc;
    }

    const allAtlases = await AtlasSpriteSheet.find({});
    for (const atlasDoc of allAtlases) {
      try {
        await purgeAtlasDoc({ atlasDoc, options });
      } catch (err) {
        logger.error(`Failed to clean up AtlasSpriteSheet ${atlasDoc._id} during bulk delete: ${err.message}`);
      }
    }
    return { deletedCount: allAtlases.length };
  };
}

export { AtlasSpriteSheetService };
