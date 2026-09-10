/**
 * Persistence for the atlas sprite sheet of one object layer item.
 *
 * Owns the AtlasSpriteSheet document, the two File blobs it points at, and the
 * IPFS pins of the atlas PNG and its metadata. Every writer — the REST service
 * and the Cyberia CLI — goes through here, so one item key always resolves to
 * one atlas.
 *
 * @module src/projects/cyberia/atlas-sprite-sheet-store.js
 * @namespace CyberiaAtlasSpriteSheetStore
 */

import crypto from 'crypto';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { createPinRecord } from '../../api/ipfs/ipfs.service.js';
import { FileFactory } from '../../api/file/file.service.js';
import { AtlasSpriteSheetGenerator, DEFAULT_ATLAS_UPSCALE_FACTOR } from './atlas-sprite-sheet-generator.js';
import { IpfsClient } from './ipfs-client.js';

const logger = loggerFactory(import.meta);

/** The File-referencing fields of this model, as `file.ref.json` registers them. */
export const ATLAS_FILE_FIELDS = ['fileId', 'minifyFileId'];

/**
 * MFS paths of the IPFS content an item key owns.
 * @param {string} itemKey - Object layer item id.
 * @returns {{ png: string, metadata: string }}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
export const atlasMfsPaths = (itemKey) => ({
  png: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
  metadata: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
});

/**
 * The File `_id` a render resolves through, derived from the item key, the render
 * role and the bytes themselves.
 *
 * Content-addressed on purpose: identical bytes re-derive the same id, which makes
 * a rerun a no-op instead of a churn of File documents. Changed bytes land on a new
 * id, and the writer deletes the one it replaced.
 *
 * @param {string} itemKey - Object layer item id.
 * @param {string} role - Render role, `atlas` or `minify`.
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
 * @param {string} itemKey - Object layer item id.
 * @param {string} role - Render role, `atlas` or `minify`.
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
 * Deletes the File documents an atlas no longer points at.
 *
 * @param {Object} File - Mongoose File model.
 * @param {Array<import('mongoose').Types.ObjectId>} previousIds - File ids held before the write.
 * @param {Array<import('mongoose').Types.ObjectId>} currentIds - File ids held after the write.
 * @returns {Promise<void>}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const deleteReplacedFiles = async (File, previousIds, currentIds) => {
  const kept = new Set(currentIds.filter(Boolean).map(String));
  const replaced = [...new Set(previousIds.filter(Boolean).map(String))].filter((id) => !kept.has(id));
  if (replaced.length === 0) return;
  await File.deleteMany({ _id: { $in: replaced } });
  logger.info(`Removed ${replaced.length} replaced atlas File document(s)`);
};

/**
 * Pins a payload to IPFS and records it in the registry. A failure is logged and
 * yields an empty CID, so a missing IPFS node never blocks a write.
 *
 * @param {Object} params
 * @param {function(): Promise<{cid: string}|null>} params.add - The IpfsClient call.
 * @param {string} params.resourceType - Registry category.
 * @param {string} params.mfsPath - MFS path of the payload.
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<string>} The CID, or an empty string.
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const pin = async ({ add, resourceType, mfsPath, options }) => {
  try {
    const result = await add();
    if (!result) return '';
    await createPinRecord({ cid: result.cid, resourceType, mfsPath, options });
    logger.info(`Pinned ${resourceType} – CID: ${result.cid}`);
    return result.cid;
  } catch (error) {
    logger.warn(`Failed to pin ${resourceType}: ${error.message}`);
    return '';
  }
};

/**
 * Tells whether two atlas layouts place every frame at the same cell.
 *
 * @param {Object} left - Atlas metadata.
 * @param {Object} right - Atlas metadata.
 * @returns {boolean}
 * @memberof CyberiaAtlasSpriteSheetStore
 */
const sameLayout = (left, right) => {
  if (left.atlasWidth !== right.atlasWidth || left.atlasHeight !== right.atlasHeight) return false;
  const box = (frame) => (frame ? `${frame.x},${frame.y},${frame.width},${frame.height}` : '');
  const directions = new Set([...Object.keys(left.frames ?? {}), ...Object.keys(right.frames ?? {})]);
  for (const direction of directions) {
    const leftFrames = left.frames?.[direction] ?? [];
    const rightFrames = right.frames?.[direction] ?? [];
    if (leftFrames.length !== rightFrames.length) return false;
    for (let index = 0; index < leftFrames.length; index++) {
      if (box(leftFrames[index]) !== box(rightFrames[index])) return false;
    }
  }
  return true;
};

/**
 * Atlas sprite sheet persistence, keyed by object layer item id.
 * @class AtlasSpriteSheetStore
 * @memberof CyberiaAtlasSpriteSheetStore
 */
export class AtlasSpriteSheetStore {
  /**
   * Generates both renders of an item's atlas and stores them.
   *
   * The write is keyed by `metadata.itemKey`, so a rerun updates the same
   * document. Renders whose bytes did not change keep their File documents;
   * renders that changed replace them and the old ones are deleted.
   *
   * @static
   * @param {Object} params
   * @param {string} params.itemKey - Object layer item id.
   * @param {Object} params.objectLayerRenderFrames - Render frames, document or plain object.
   * @param {number} [params.upscaleFactor=DEFAULT_ATLAS_UPSCALE_FACTOR] - Pixels per cell of the human-resolution render.
   * @param {number} [params.maxAtlasDim=null] - Maximum atlas dimension, auto-calculated when null.
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<{atlasDoc: Object, metadata: Object, atlasCid: string, atlasMetadataCid: string}>}
   *   `metadata` is the plain generated layout, free of the document wrapper a caller would have to unwrap.
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async persist({
    itemKey,
    objectLayerRenderFrames,
    upscaleFactor = DEFAULT_ATLAS_UPSCALE_FACTOR,
    maxAtlasDim = null,
    options,
  }) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);

    const { buffer, minifyBuffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
      objectLayerRenderFrames,
      itemKey,
      upscaleFactor,
      maxAtlasDim,
    );

    const fileId = await upsertRenderFile(File, itemKey, 'atlas', buffer);
    const minifyFileId = await upsertRenderFile(File, itemKey, 'minify', minifyBuffer);

    const mfsPaths = atlasMfsPaths(itemKey);
    const atlasCid = await pin({
      add: () => IpfsClient.addBufferToIpfs(buffer, `${itemKey}_atlas_sprite_sheet.png`, mfsPaths.png),
      resourceType: 'atlas-sprite-sheet',
      mfsPath: mfsPaths.png,
      options,
    });
    const atlasMetadataCid = await pin({
      add: () => IpfsClient.addJsonToIpfs(metadata, `${itemKey}_atlas_sprite_sheet_metadata.json`, mfsPaths.metadata),
      resourceType: 'atlas-metadata',
      mfsPath: mfsPaths.metadata,
      options,
    });

    let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
    const previousFileIds = atlasDoc ? ATLAS_FILE_FIELDS.map((field) => atlasDoc[field]) : [];

    if (atlasDoc) {
      atlasDoc.set({ fileId, minifyFileId, cid: atlasCid, metadata });
      await atlasDoc.save();
    } else {
      atlasDoc = await new AtlasSpriteSheet({ fileId, minifyFileId, cid: atlasCid, metadata }).save();
    }

    await deleteReplacedFiles(File, previousFileIds, [fileId, minifyFileId]);

    return { atlasDoc, metadata, atlasCid, atlasMetadataCid };
  }

  /**
   * Refreshes only the minified render of a stored atlas.
   *
   * The layout must still match the stored metadata, because the client runtime
   * pairs `GET /blob/:itemKey` with `GET /metadata/:itemKey`. A layout that moved
   * means the render frames changed after the atlas was generated, so the item is
   * reported as stale instead of written.
   *
   * @static
   * @param {Object} params
   * @param {string} params.itemKey - Object layer item id.
   * @param {Object} params.objectLayerRenderFrames - Render frames, document or plain object.
   * @param {Object} [params.options] - Router options ({ host, path }) for model lookup.
   * @returns {Promise<{ status: 'updated'|'unchanged'|'missing'|'stale', minifyFileId?: import('mongoose').Types.ObjectId }>}
   * @memberof CyberiaAtlasSpriteSheetStore
   */
  static async syncMinifyRender({ itemKey, objectLayerRenderFrames, options }) {
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    const File = DataBaseProviderService.getModel('File', options);

    const atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
    if (!atlasDoc) return { status: 'missing' };

    // Only the minified render is wanted here, so ask for no upscaled second render.
    const { minifyBuffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
      objectLayerRenderFrames,
      itemKey,
      1,
    );

    if (!sameLayout(metadata, atlasDoc.metadata.toObject ? atlasDoc.metadata.toObject() : atlasDoc.metadata)) {
      return { status: 'stale' };
    }

    const previousId = atlasDoc.minifyFileId;
    const minifyFileId = await upsertRenderFile(File, itemKey, 'minify', minifyBuffer);
    if (previousId && String(previousId) === String(minifyFileId)) {
      return { status: 'unchanged', minifyFileId };
    }

    await AtlasSpriteSheet.updateOne({ _id: atlasDoc._id }, { $set: { minifyFileId } });
    await deleteReplacedFiles(File, [previousId], [minifyFileId]);

    return { status: 'updated', minifyFileId };
  }
}
