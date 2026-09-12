import fs from 'fs-extra';
import path from 'node:path';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { createPinRecord } from '../../api/ipfs/ipfs.service.js';
import { IpfsClient } from './ipfs-client.js';
import { AtlasSpriteSheetStore, atlasMfsPaths } from './atlas-sprite-sheet-store.js';
import { DEFAULT_ATLAS_UPSCALE_FACTOR } from './atlas-sprite-sheet-generator.js';
import { ObjectLayerEngine } from './object-layer.js';

const logger = loggerFactory(import.meta);

/* A File's bytes as the export wrote them: base64, or a serialised Buffer. */
const decodeFileData = (data) => {
  if (!data) return data;
  if (data.$base64) return Buffer.from(data.$base64, 'base64');
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  return data;
};

const readJsonIfPresent = (file) => (fs.existsSync(file) ? fs.readJsonSync(file) : null);

/**
 * Reads everything an instance backup holds for one object layer.
 *
 * The object layer names its render frames and atlas by `_id`; the atlas names its two render
 * Files the same way. Files are matched on that `_id`, never on file name, so a backup that
 * renamed its renders still resolves. The IPFS payloads are the raw bytes behind the three
 * CIDs the item references, when the backup carried them.
 *
 * @param {{backupDir: string, itemId: string}} params
 * @returns {{
 *   objectLayer: object, renderFrames: object|null, atlas: object|null,
 *   files: object[], payloads: Map<string, Buffer>,
 * }}
 * @throws {Error} When the backup has no object layer for the item.
 */
export function readObjectLayerBackup({ backupDir, itemId }) {
  const objectLayer = readJsonIfPresent(path.join(backupDir, 'object-layers', `${itemId}.json`));
  if (!objectLayer) throw new Error(`Backup at ${backupDir} has no object layer '${itemId}'`);

  const renderFrames = readJsonIfPresent(path.join(backupDir, 'render-frames', `${itemId}.json`));
  const atlas = readJsonIfPresent(path.join(backupDir, 'atlas-sprite-sheets', `${itemId}.json`));

  const wanted = new Set([atlas?.fileId, atlas?.minifyFileId].filter(Boolean).map(String));
  const filesDir = path.join(backupDir, 'files');
  const files = [];
  if (wanted.size > 0 && fs.existsSync(filesDir)) {
    for (const name of fs.readdirSync(filesDir)) {
      if (!name.endsWith('.json')) continue;
      const doc = fs.readJsonSync(path.join(filesDir, name));
      if (!wanted.has(String(doc._id))) continue;
      files.push({ ...doc, data: decodeFileData(doc.data) });
    }
  }

  const payloads = new Map();
  const contentDir = path.join(backupDir, 'ipfs', 'content');
  for (const cid of [objectLayer.cid, objectLayer.data?.render?.cid, objectLayer.data?.render?.metadataCid]) {
    if (!cid) continue;
    const payload = path.join(contentDir, `${cid}.bin`);
    if (fs.existsSync(payload)) payloads.set(cid, fs.readFileSync(payload));
  }

  return { objectLayer, renderFrames, atlas, files, payloads };
}

/* Re-adds one payload and pins it under its canonical path. Returns the CID IPFS assigned, or
 * the backup's own when IPFS is unreachable, so the documents still point at something real. */
const restorePayload = async ({ cid, payload, mfsPath, resourceType, options }) => {
  if (!payload) return cid;
  const added = await IpfsClient.addToIpfs(payload, path.basename(mfsPath), mfsPath);
  if (!added?.cid) {
    logger.warn(`IPFS add failed for ${mfsPath}; keeping the backup CID ${cid}`);
    return cid;
  }
  if (added.cid !== cid) logger.warn(`IPFS assigned ${added.cid} to ${mfsPath}; the backup said ${cid}`);
  await createPinRecord({ cid: added.cid, resourceType, mfsPath, options });
  return added.cid;
};

/**
 * Restores one object layer from an instance backup, making the backup the authority for that
 * item id: its render frames, atlas, atlas render Files, IPFS pins and payloads, and the static
 * frame PNGs, replacing whatever the database holds under that id.
 *
 * Payloads go to IPFS first, so the documents are written with the CIDs IPFS actually
 * assigned. `_id`s are kept, so references between the restored documents stay intact.
 *
 * @param {{backupDir: string, itemId: string, options: {host: string, path: string}}} params
 * @returns {Promise<{itemId: string, files: number, renderFrames: boolean, atlas: boolean, pins: number, staticFiles: number}>}
 */
export async function restoreObjectLayerBackup({ backupDir, itemId, options }) {
  const { objectLayer, renderFrames, atlas, files, payloads } = readObjectLayerBackup({ backupDir, itemId });
  const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
  const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
  const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
  const File = DataBaseProviderService.getModel('File', options);

  // 1. IPFS, so every CID below is one the node will serve.
  const mfs = atlasMfsPaths(itemId);
  const targets = [
    {
      key: 'cid',
      get: () => objectLayer.cid,
      set: (v) => (objectLayer.cid = v),
      mfsPath: `/object-layer/${itemId}/${itemId}_data.json`,
      resourceType: 'object-layer-data',
    },
    {
      key: 'render',
      get: () => objectLayer.data?.render?.cid,
      set: (v) => (objectLayer.data.render.cid = v),
      mfsPath: mfs.png,
      resourceType: 'atlas-sprite-sheet',
    },
    {
      key: 'metadata',
      get: () => objectLayer.data?.render?.metadataCid,
      set: (v) => (objectLayer.data.render.metadataCid = v),
      mfsPath: mfs.metadata,
      resourceType: 'atlas-metadata',
    },
  ];
  let pins = 0;
  for (const target of targets) {
    const cid = target.get();
    if (!cid) continue;
    const finalCid = await restorePayload({
      cid,
      payload: payloads.get(cid),
      mfsPath: target.mfsPath,
      resourceType: target.resourceType,
      options,
    });
    if (payloads.has(cid)) pins++;
    target.set(finalCid);
    if (target.key === 'render' && atlas) atlas.cid = finalCid;
  }

  // 2. Documents, leaves first so every reference resolves as it lands.
  for (const file of files) {
    await File.deleteOne({ _id: file._id });
    await File.create(file);
  }
  if (renderFrames?._id) {
    await ObjectLayerRenderFrames.deleteOne({ _id: renderFrames._id });
    await ObjectLayerRenderFrames.create(renderFrames);
  }
  if (atlas) {
    await AtlasSpriteSheet.deleteOne({ _id: atlas._id });
    await AtlasSpriteSheet.deleteOne({ 'metadata.itemKey': itemId });
    await AtlasSpriteSheet.create(atlas);
    await AtlasSpriteSheetStore.pruneOrphanRenders({ options });
  }
  // An item the database already has keeps its own _id and takes the backup's values, so an
  // item id can never fork into two documents.
  const existing = await ObjectLayer.findByItemId(itemId);
  if (!existing && objectLayer._id) await ObjectLayer.deleteOne({ _id: objectLayer._id });
  await ObjectLayer.upsertByItemId(objectLayer);

  // 3. The static frame PNGs the web client serves, from the same render frames.
  let staticFiles = 0;
  const itemType = objectLayer.data?.item?.type;
  if (renderFrames && itemType) {
    const written = await ObjectLayerEngine.writeStaticFrameAssets({
      basePaths: ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`],
      itemType,
      itemId,
      objectLayerRenderFramesData: {
        frames: renderFrames.frames || {},
        colors: renderFrames.colors || [],
        frame_duration: renderFrames.frame_duration ?? 100,
      },
      objectLayerData: objectLayer,
      cellPixelDim: DEFAULT_ATLAS_UPSCALE_FACTOR,
    });
    staticFiles = written.length;
  }

  return { itemId, files: files.length, renderFrames: !!renderFrames, atlas: !!atlas, pins, staticFiles };
}
