import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { FileCleanup } from '../file/file.service.js';
import { AtlasSpriteSheetDto } from './atlas-sprite-sheet.model.js';
import { IpfsClient } from '../../projects/cyberia/ipfs-client.js';
import { removePinRecordsAndUnpin } from '../ipfs/ipfs.service.js';
import {
  ATLAS_FILE_FIELDS,
  AtlasSpriteSheetStore,
  atlasMfsPaths,
} from '../../projects/cyberia/atlas-sprite-sheet-store.js';

const logger = loggerFactory(import.meta);
const DEFAULT_ATLAS_FRAME_DURATION = 100;

function parseAtlasFrameDuration(value) {
  const frameDuration = Number(value);
  return Number.isFinite(frameDuration) ? frameDuration : null;
}

async function resolveAtlasFrameDuration(ObjectLayer, itemKey) {
  if (!itemKey) return DEFAULT_ATLAS_FRAME_DURATION;

  const objectLayer = await ObjectLayer.findOne({ 'data.item.id': itemKey })
    .select({ _id: 1, objectLayerRenderFramesId: 1 })
    .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1 })
    .lean();

  return (
    parseAtlasFrameDuration(objectLayer?.objectLayerRenderFramesId?.frame_duration) || DEFAULT_ATLAS_FRAME_DURATION
  );
}

async function withResolvedAtlasFrameDuration(doc, ObjectLayer) {
  if (!doc?.metadata) return doc;

  const frameDuration = parseAtlasFrameDuration(doc.metadata.frame_duration);
  if (frameDuration !== null) {
    return {
      ...doc,
      metadata: {
        ...doc.metadata,
        frame_duration: frameDuration,
      },
    };
  }

  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      frame_duration: await resolveAtlasFrameDuration(ObjectLayer, doc.metadata.itemKey),
    },
  };
}

/**
 * Removes one atlas: its IPFS pins and MFS entries, both render File documents,
 * and the AtlasSpriteSheet document itself.
 *
 * @param {Object} params
 * @param {Object} params.atlasDoc - The AtlasSpriteSheet document.
 * @param {Object} params.options - Router options ({ host, path }).
 * @param {string} [params.itemKey] - Item key, when the caller already resolved it.
 * @param {string} [params.metadataCid] - Atlas metadata CID, when the object layer holds it.
 * @returns {Promise<void>}
 */
const purgeAtlasDoc = async ({ atlasDoc, options, itemKey, metadataCid }) => {
  const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
  const File = DataBaseProviderService.getModel('File', options);
  const key = itemKey || atlasDoc.metadata?.itemKey;
  const mfsPaths = key ? atlasMfsPaths(key) : null;

  for (const [cid, mfsPath] of [
    [atlasDoc.cid, mfsPaths?.png],
    [metadataCid, mfsPaths?.metadata],
  ]) {
    if (!cid) continue;
    try {
      await removePinRecordsAndUnpin(cid, options);
      if (mfsPath) await IpfsClient.removeMfsPath(mfsPath);
      logger.info(`Cleaned up IPFS CID ${cid} for AtlasSpriteSheet ${atlasDoc._id}`);
    } catch (ipfsErr) {
      logger.warn(`Failed to clean up IPFS CID ${cid}: ${ipfsErr.message}`);
    }
  }

  await FileCleanup.deleteDocumentFiles({ doc: atlasDoc, fileFields: ATLAS_FILE_FIELDS, File });
  await AtlasSpriteSheet.findByIdAndDelete(atlasDoc._id);
};

class AtlasSpriteSheetService {
  // Serves the minified render, the one `metadata` describes. The client runtime
  // pairs this blob with GET /metadata/:itemKey, so the two must be the same layout.
  static blob = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProviderService.getModel('File', options);

    const itemKey = req.params.itemKey;
    const atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey }).lean();
    if (!atlasDoc) throw new Error(`Atlas not found for itemKey: ${itemKey}`);
    if (!atlasDoc.minifyFileId) throw new Error(`Minified atlas render missing for itemKey: ${itemKey}`);

    const fileDoc = await File.findById(atlasDoc.minifyFileId);
    if (!fileDoc || !fileDoc.data) throw new Error(`File not found for atlas itemKey: ${itemKey}`);

    return { buffer: Buffer.from(fileDoc.data), mimetype: fileDoc.mimetype || 'image/png', name: fileDoc.name };
  };
  static generate = async (req, res, options, generateOptions = {}) => {
    /** @type {import('../object-layer/object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);

    const objectLayer =
      req.objectLayer || (await ObjectLayer.findById(req.params.id).populate('objectLayerRenderFramesId'));

    if (!objectLayer) throw new Error('ObjectLayer not found');
    if (!objectLayer.objectLayerRenderFramesId) throw new Error('ObjectLayer has no render frames');

    const { atlasDoc, atlasCid, atlasMetadataCid } = await AtlasSpriteSheetStore.persist({
      itemKey: objectLayer.data.item.id,
      objectLayerRenderFrames: objectLayer.objectLayerRenderFramesId,
      upscaleFactor: generateOptions.upscaleFactor,
      options,
    });

    // Callers that stage CIDs in memory write the ObjectLayer themselves, so the
    // document stays untouched until every CID is known.
    if (generateOptions.skipObjectLayerSave) {
      return { atlasDoc, atlasCid, atlasMetadataCid };
    }

    objectLayer.atlasSpriteSheetId = atlasDoc._id;
    if (!objectLayer.data.render) objectLayer.data.render = {};
    objectLayer.data.render.cid = atlasCid;
    objectLayer.data.render.metadataCid = atlasMetadataCid;
    objectLayer.markModified('data.render');
    await objectLayer.save();

    return atlasDoc;
  };
  static deleteByObjectLayerId = async (req, res, options) => {
    /** @type {import('../object-layer/object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);

    const objectLayer = await ObjectLayer.findById(req.params.id);
    if (!objectLayer) {
      throw new Error('ObjectLayer not found');
    }

    if (objectLayer.atlasSpriteSheetId) {
      const atlasDoc = await AtlasSpriteSheet.findById(objectLayer.atlasSpriteSheetId);
      if (atlasDoc) {
        await purgeAtlasDoc({
          atlasDoc,
          options,
          itemKey: objectLayer.data.item.id,
          metadataCid: objectLayer.data.render?.metadataCid,
        });
      }
      objectLayer.atlasSpriteSheetId = undefined;
      if (!objectLayer.data.render) objectLayer.data.render = {};
      objectLayer.data.render.cid = '';
      objectLayer.data.render.metadataCid = '';
      objectLayer.markModified('data.render');
      await objectLayer.save();
    }

    return { success: true };
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
  // Returns atlas metadata (layout + frames) for the client.
  // Client fetches this once per itemKey, caches it, then fetches the PNG blob.
  static getMetadata = async (req, res, options) => {
    /** @type {import('../object-layer/object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);

    if (req.params.itemKey) {
      const doc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': req.params.itemKey })
        .select(AtlasSpriteSheetDto.select.getMetadataOnly())
        .lean();
      if (!doc) throw new Error(`Atlas not found for itemKey: ${req.params.itemKey}`);
      return await withResolvedAtlasFrameDuration(doc, ObjectLayer);
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

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map((doc) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          frame_duration: parseAtlasFrameDuration(doc?.metadata?.frame_duration) || DEFAULT_ATLAS_FRAME_DURATION,
        },
      })),
      total,
      page,
      totalPages,
    };
  };
  static put = async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
    return await AtlasSpriteSheet.findByIdAndUpdate(req.params.id, req.body);
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
