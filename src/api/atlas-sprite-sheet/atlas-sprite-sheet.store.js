/**
 * Persistence for the atlas sprite sheet: the local materialization of the render of one Object
 * Layer definition.
 *
 * The definition owns the render. `data.render.cid` addresses the primary render and
 * `data.render.metadataCid` its layout, both computed from the bytes by
 * {@link canonicalRender}. This store writes those bytes to the File collection and keeps the
 * AtlasSpriteSheet document of each definition that names them, keyed by the definition's cid,
 * together with the renders derived from them. Every writer — the REST service and the Cyberia
 * CLI — goes through here. IPFS stores the render with its definition (`object-layer.ipfs.js`).
 *
 * A definition never changes, so neither does the primary render and layout of its atlas. Only
 * the derived renders are filled in afterwards. Files are addressed by their bytes, so the atlases
 * of two definitions that name one render share them.
 *
 * @module src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js
 * @namespace CyberiaAtlasSpriteSheetStore
 */

import crypto from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { FileFactory } from '../file/file.service.js';
import { deleteOwnedFiles, documentFileIds, fileRefFields } from '../file/file.ref.js';
import { AtlasSpriteSheetGenerator, DEFAULT_ATLAS_UPSCALE_FACTOR } from './atlas-sprite-sheet.generator.js';
import { canonicalRender } from '../object-layer/object-layer.identity.js';
import { objectLayerCache } from '../object-layer/object-layer.publication.js';
import { CacheService } from '../../server/storage/cache.js';

const logger = loggerFactory(import.meta);

/** The File-referencing fields of this model, read from the registry that owns that mapping. */
export const ATLAS_FILE_FIELDS = fileRefFields('atlas-sprite-sheet');
const fileProjection = Object.fromEntries(ATLAS_FILE_FIELDS.map((field) => [field, 1]));

/**
 * The File `name` a render is written under, as {@link upsertRenderFile} spells it.
 * A prune reads it to recognise a render whose atlas is already gone.
 * @constant {RegExp}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const ATLAS_RENDER_NAME = /-(primary|upscale|idle)\.png$/;

/**
 * The File `_id` a render resolves through, derived from the item label, the render role and
 * the bytes themselves.
 *
 * Content-addressed on purpose: identical bytes re-derive the same id, which makes a rerun a
 * no-op instead of a churn of File documents. Two atlases can therefore share a File.
 *
 * @param {string} itemKey - Object layer item label.
 * @param {string} role - Render role: `primary`, `upscale` or `idle`.
 * @param {string} md5 - Hex MD5 of the PNG bytes.
 * @returns {import('mongoose').Types.ObjectId}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const atlasFileId = (itemKey, role, md5) =>
  new Types.ObjectId(crypto.createHash('sha256').update(`atlas:${itemKey}:${role}:${md5}`).digest('hex').slice(0, 24));

/**
 * Writes a PNG render to the File collection under its content-addressed id.
 * Re-writing the same bytes returns the stored document untouched.
 *
 * @param {Object} File - Mongoose File model.
 * @param {string} itemKey - Object layer item label.
 * @param {string} role - Render role: `primary`, `upscale` or `idle`.
 * @param {Buffer} buffer - PNG bytes.
 * @returns {Promise<import('mongoose').Types.ObjectId>} The File id.
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const upsertRenderFile = async (File, itemKey, role, buffer) => {
  const payload = FileFactory.create(buffer, `${itemKey}-${role}.png`);
  const _id = atlasFileId(itemKey, role, payload.md5);
  await File.updateOne({ _id }, { $setOnInsert: { ...payload, _id } }, { upsert: true });
  return _id;
};

/**
 * Writes the renders derived from a primary render: the upscaled render and the idle
 * still. Either is null when the primary render yields none.
 *
 * @param {Object} File - Mongoose File model.
 * @param {string} itemKey - Object layer item label.
 * @param {Buffer} primary - PNG bytes of the primary render.
 * @param {Object} metadata - Layout of the primary render.
 * @returns {Promise<{upscaleFileId: import('mongoose').Types.ObjectId|null, idlePreviewFileId: import('mongoose').Types.ObjectId|null}>}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const upsertDerivedRenders = async (File, itemKey, primary, metadata) => {
  const upscaled = await AtlasSpriteSheetGenerator.upscaledFromRender(primary, metadata);
  const still = await AtlasSpriteSheetGenerator.idlePreviewFromRender(primary, metadata);
  return {
    upscaleFileId: upscaled ? await upsertRenderFile(File, itemKey, 'upscale', upscaled) : null,
    idlePreviewFileId: still ? await upsertRenderFile(File, itemKey, 'idle', still) : null,
  };
};

/**
 * Whether atlas renders are shared with other content releases: the atlas collection lives in
 * a release database while File does not. A shared render is never deleted on replace.
 * @param {Object} AtlasSpriteSheet - Mongoose AtlasSpriteSheet model.
 * @param {Object} File - Mongoose File model.
 * @returns {boolean}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const rendersShared = (AtlasSpriteSheet, File) => AtlasSpriteSheet.db?.name !== File.db?.name;

/**
 * Deletes the File documents an atlas no longer points at, unless another atlas still does.
 * Renders shared across content releases are left for `cyberia content-release prune`.
 *
 * @param {Object} AtlasSpriteSheet - Mongoose AtlasSpriteSheet model.
 * @param {Object} File - Mongoose File model.
 * @param {Array<import('mongoose').Types.ObjectId>} previousIds - File ids held before the write.
 * @param {Array<import('mongoose').Types.ObjectId>} currentIds - File ids held after the write.
 * @returns {Promise<void>}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const deleteReplacedFiles = async (AtlasSpriteSheet, File, previousIds, currentIds) => {
  if (rendersShared(AtlasSpriteSheet, File)) return;
  const kept = new Set(currentIds.filter(Boolean).map(String));
  const replaced = [...new Set(previousIds.filter(Boolean).map(String))].filter((id) => !kept.has(id));
  const removed = await deleteOwnedFiles({ File, Owner: AtlasSpriteSheet, fields: ATLAS_FILE_FIELDS, ids: replaced });
  if (removed > 0) logger.info(`Removed ${removed} replaced atlas File document(s)`);
};

/**
 * @typedef {Object} AtlasMaterialization
 * @property {import('mongoose').Types.ObjectId} fileId - Primary render File.
 * @property {import('mongoose').Types.ObjectId|null} upscaleFileId - Upscaled derived render File.
 * @property {import('mongoose').Types.ObjectId|null} idlePreviewFileId - Idle preview File.
 * @property {Object} metadata - Layout of the primary render.
 * @memberof CyberiaAtlasSpriteSheetStore
 */

/**
 * Atlas sprite sheet persistence: one atlas per definition.
 * @class AtlasSpriteSheetStore
 * @memberof CyberiaAtlasSpriteSheetStore
 */
export class AtlasSpriteSheetStore {
  /**
   * Generates the render of an item's frames and stores its Files. The render contract is computed
   * from the bytes; the caller publishes the definition that names it, then records the
   * materialization under that definition with {@link AtlasSpriteSheetStore.materialize}.
   *
   * @static
   * @param {Object} params
   * @param {string} params.itemKey - Object layer item label.
   * @param {Object} params.objectLayerRenderFrames - Render frames, document or plain object.
   * @param {number} [params.upscaleFactor=DEFAULT_ATLAS_UPSCALE_FACTOR] - Pixels per cell of the upscaled render.
   * @param {number} [params.maxAtlasDim=null] - Maximum atlas dimension, auto-calculated when null.
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<{render: {cid: string, metadataCid: string}, atlas: AtlasMaterialization}>}
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async build({
    itemKey,
    objectLayerRenderFrames,
    upscaleFactor = DEFAULT_ATLAS_UPSCALE_FACTOR,
    maxAtlasDim = null,
    options,
  }) {
    const File = DataBaseProviderService.getModel('File', options);
    const { primary, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
      objectLayerRenderFrames,
      itemKey,
      upscaleFactor,
      maxAtlasDim,
    );
    const render = canonicalRender({ primary, metadata }).contract;
    const fileId = await upsertRenderFile(File, itemKey, 'primary', primary);
    const derived = await upsertDerivedRenders(File, itemKey, primary, metadata);
    return { render, atlas: { fileId, ...derived, metadata } };
  }

  /**
   * Records the atlas of a definition, replacing the one it held. The Files it no longer points
   * at go unless another atlas holds them. An atlas whose fields equal these in structure and
   * values is left as it is, so a rerun changes nothing.
   *
   * @static
   * @param {Object} params
   * @param {string} params.objectLayerCid - Canonical CID of the definition whose render `atlas` is.
   * @param {AtlasMaterialization} params.atlas
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<Object>} The stored atlas, lean.
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async materialize({ objectLayerCid, atlas, options }) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);
    const fields = {
      fileId: atlas.fileId,
      upscaleFileId: atlas.upscaleFileId ?? null,
      idlePreviewFileId: atlas.idlePreviewFileId ?? null,
      metadata: atlas.metadata,
    };
    const previous = await AtlasSpriteSheet.findOne({ objectLayerCid }).lean();
    if (previous && Object.keys(fields).every((field) => isDeepStrictEqual(previous[field], fields[field])))
      return previous;
    const atlasDoc = await AtlasSpriteSheet.findOneAndUpdate(
      { objectLayerCid },
      { $set: fields },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
    if (previous)
      await deleteReplacedFiles(
        AtlasSpriteSheet,
        File,
        ATLAS_FILE_FIELDS.map((field) => previous[field]),
        ATLAS_FILE_FIELDS.map((field) => fields[field]),
      );
    await CacheService.invalidate(objectLayerCache(options));
    return atlasDoc;
  }

  /**
   * Whether this host's atlases share their render Files with other content stores: a content
   * release shares them with every other release.
   *
   * @static
   * @param {Object} options - Router options ({ host, path }) for model lookup.
   * @returns {boolean}
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static sharedStore(options) {
    return rendersShared(
      DataBaseProviderService.getModel('AtlasSpriteSheet', options),
      DataBaseProviderService.getModel('File', options),
    );
  }

  /**
   * Removes the atlases of definitions and every File render they own that no other atlas holds.
   *
   * The one place a caller deletes an atlas: an atlas owns its document and every render File it
   * points at. A shared store leaves the Files to `cyberia content-release prune`. Rerunnable — a
   * second call finds nothing and reports zeros.
   *
   * @static
   * @param {Object} params
   * @param {string[]} [params.objectLayerCids] - Canonical CIDs of the definitions whose atlases go.
   * @param {boolean} [params.all=false] - Purge the whole collection, ignoring `objectLayerCids`.
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<{atlases: number, files: number}>} What was removed.
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async purge({ objectLayerCids = [], all = false, options }) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);

    if (!all && objectLayerCids.length === 0) return { atlases: 0, files: 0 };
    const docs = await AtlasSpriteSheet.find(
      all ? {} : { objectLayerCid: { $in: objectLayerCids } },
      fileProjection,
    ).lean();
    if (docs.length === 0) return { atlases: 0, files: 0 };

    const fileIds = documentFileIds(docs, ATLAS_FILE_FIELDS);
    // Documents first: the survivors this reads decide which renders are still
    // reachable, so the ones being dropped must already be gone.
    const { deletedCount } = await AtlasSpriteSheet.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
    const files = rendersShared(AtlasSpriteSheet, File)
      ? 0
      : await deleteOwnedFiles({ File, Owner: AtlasSpriteSheet, fields: ATLAS_FILE_FIELDS, ids: fileIds });
    await CacheService.invalidate(objectLayerCache(options));

    return { atlases: deletedCount ?? 0, files };
  }

  /**
   * Deletes atlas renders no atlas document points at any more.
   *
   * Candidates are recognised by the name the writer gives a render, and a candidate a live
   * atlas still holds is kept. Idempotent, and a no-op on a collection that never leaked.
   *
   * Atlases in a content release database share the File store with every other release, so
   * there the atlases of one release cannot prove a render orphaned: the prune runs only with
   * `owners` naming the atlas collection of every kept release.
   *
   * @static
   * @param {Object} params
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @param {import('mongoose').Model[]} [params.owners] - Every atlas collection whose references hold.
   * @returns {Promise<number>} How many orphaned renders were removed.
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async pruneOrphanRenders({ options, owners } = {}) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);
    if (!owners && rendersShared(AtlasSpriteSheet, File)) {
      logger.info('Atlas renders are shared across content releases; `cyberia content-release prune` removes orphans');
      return 0;
    }

    const candidates = await File.find({ name: { $regex: ATLAS_RENDER_NAME } }, { _id: 1 }).lean();
    if (candidates.length === 0) return 0;

    const removed = await deleteOwnedFiles({
      File,
      Owner: owners ?? AtlasSpriteSheet,
      fields: ATLAS_FILE_FIELDS,
      ids: candidates.map((doc) => doc._id),
    });
    if (removed > 0) logger.info(`Removed ${removed} orphaned atlas File document(s)`);
    return removed;
  }

  /**
   * Fills or refreshes the derived renders of a definition's atlas — the upscaled render and
   * the idle preview — from the primary render it holds. The render contract never changes: both
   * are exact derivations of the bytes `data.render.cid` addresses.
   *
   * @static
   * @param {Object} params
   * @param {string} params.objectLayerCid - Canonical CID of the definition.
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<{ status: 'updated'|'unchanged'|'missing' }>}
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async syncDerivedRenders({ objectLayerCid, options }) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);

    const atlasDoc = objectLayerCid ? await AtlasSpriteSheet.findOne({ objectLayerCid }) : null;
    // Hydrated, not lean: a lean read hands back a BSON Binary the decoder cannot open.
    const primary = atlasDoc?.fileId ? await File.findById(atlasDoc.fileId) : null;
    if (!primary?.data) return { status: 'missing' };

    const metadata = atlasDoc.metadata.toObject ? atlasDoc.metadata.toObject() : atlasDoc.metadata;
    const previous = { upscaleFileId: atlasDoc.upscaleFileId, idlePreviewFileId: atlasDoc.idlePreviewFileId };
    const derived = await upsertDerivedRenders(File, metadata.itemKey, Buffer.from(primary.data), metadata);
    if (Object.keys(derived).every((field) => String(previous[field] ?? '') === String(derived[field] ?? '')))
      return { status: 'unchanged' };

    await AtlasSpriteSheet.updateOne({ _id: atlasDoc._id }, { $set: derived });
    await deleteReplacedFiles(AtlasSpriteSheet, File, Object.values(previous), Object.values(derived));
    await CacheService.invalidate(objectLayerCache(options));
    return { status: 'updated' };
  }
}
