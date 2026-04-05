import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { AtlasSpriteSheetGenerator } from '../../server/atlas-sprite-sheet-generator.js';
import { FileFactory } from '../file/file.service.js';
import { AtlasSpriteSheetDto } from './atlas-sprite-sheet.model.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { createPinRecord, removePinRecordsAndUnpin } from '../ipfs/ipfs.service.js';

const logger = loggerFactory(import.meta);

const AtlasSpriteSheetService = {
  blob: async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const itemKey = req.params.itemKey;
    const atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey }).lean();
    if (!atlasDoc) throw new Error(`Atlas not found for itemKey: ${itemKey}`);

    const fileDoc = await File.findById(atlasDoc.fileId);
    if (!fileDoc || !fileDoc.data) throw new Error(`File not found for atlas itemKey: ${itemKey}`);

    return { buffer: Buffer.from(fileDoc.data), mimetype: fileDoc.mimetype || 'image/png', name: fileDoc.name };
  },
  generate: async (req, res, options, generateOptions = {}) => {
    /** @type {import('../object-layer/object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;

    let objectLayer = req.objectLayer;

    if (!objectLayer) {
      objectLayer = await ObjectLayer.findById(req.params.id).populate('objectLayerRenderFramesId');
    }

    if (!objectLayer) {
      throw new Error('ObjectLayer not found');
    }

    if (!objectLayer.objectLayerRenderFramesId) {
      throw new Error('ObjectLayer has no render frames');
    }

    const itemKey = objectLayer.data.item.id;
    const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
      objectLayer.objectLayerRenderFramesId,
      itemKey,
    );

    const fileDoc = await new File(FileFactory.create(buffer, `${itemKey}.png`)).save();

    // Add atlas PNG to IPFS and obtain its CID
    let atlasCid = '';
    let atlasMetadataCid = '';
    const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
    try {
      const ipfsResult = await IpfsClient.addBufferToIpfs(
        buffer,
        `${itemKey}_atlas_sprite_sheet.png`,
        `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
      );
      if (ipfsResult) {
        atlasCid = ipfsResult.cid;
        logger.info(`Atlas sprite sheet pinned to IPFS – CID: ${atlasCid}`);
      }
    } catch (ipfsError) {
      logger.warn('Failed to add atlas sprite sheet to IPFS:', ipfsError.message);
    }

    // Pin atlas metadata JSON to IPFS (fast-json-stable-stringify) and obtain its CID
    try {
      const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
        metadata,
        `${itemKey}_atlas_sprite_sheet_metadata.json`,
        `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
      );
      if (metadataIpfsResult) {
        atlasMetadataCid = metadataIpfsResult.cid;
        logger.info(`Atlas metadata pinned to IPFS – CID: ${atlasMetadataCid}`);
      }
    } catch (ipfsError) {
      logger.warn('Failed to add atlas metadata to IPFS:', ipfsError.message);
    }

    let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });

    if (atlasDoc) {
      // Clean up old file if it exists
      if (atlasDoc.fileId) {
        await File.findByIdAndDelete(atlasDoc.fileId);
      }
      atlasDoc.fileId = fileDoc._id;
      atlasDoc.cid = atlasCid;
      atlasDoc.metadata = metadata;
      await atlasDoc.save();
    } else {
      atlasDoc = await new AtlasSpriteSheet({
        fileId: fileDoc._id,
        cid: atlasCid,
        metadata,
      }).save();
    }

    // Register CIDs in the IPFS registry now that atlasDoc._id is known.
    if (atlasCid) {
      try {
        await createPinRecord({
          cid: atlasCid,
          resourceType: 'atlas-sprite-sheet',
          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
          options,
        });
      } catch (e) {
        logger.warn('IPFS registry update failed (atlas PNG):', e.message);
      }
    }
    if (atlasMetadataCid) {
      try {
        await createPinRecord({
          cid: atlasMetadataCid,
          resourceType: 'atlas-metadata',
          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
          options,
        });
      } catch (e) {
        logger.warn('IPFS registry update failed (atlas metadata):', e.message);
      }
    }

    // When skipObjectLayerSave is set, return CIDs without mutating the OL document.
    // This enables cut-over consistency: callers stage CIDs in memory and write the
    // ObjectLayer atomically only after all CIDs are computed.
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
  },
  deleteByObjectLayerId: async (req, res, options) => {
    /** @type {import('../object-layer/object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;

    const objectLayer = await ObjectLayer.findById(req.params.id);
    if (!objectLayer) {
      throw new Error('ObjectLayer not found');
    }

    if (objectLayer.atlasSpriteSheetId) {
      const atlasDoc = await AtlasSpriteSheet.findById(objectLayer.atlasSpriteSheetId);
      if (atlasDoc) {
        // Remove pin records and unpin atlas CID from IPFS
        const atlasCid = atlasDoc.cid || objectLayer.data.render?.cid;
        const atlasMetadataCid = objectLayer.data.render?.metadataCid;
        if (atlasCid) {
          try {
            await removePinRecordsAndUnpin(atlasCid, options);
            // Remove the MFS entry for the atlas sprite sheet PNG
            const itemId = objectLayer.data.item.id;
            await IpfsClient.removeMfsPath(`/object-layer/${itemId}/${itemId}_atlas_sprite_sheet.png`);
            logger.info(`Cleaned up IPFS atlas CID ${atlasCid} for ObjectLayer ${objectLayer._id}`);
          } catch (ipfsErr) {
            logger.warn(`Failed to clean up IPFS atlas CID ${atlasCid}: ${ipfsErr.message}`);
          }
        }
        if (atlasMetadataCid) {
          try {
            await removePinRecordsAndUnpin(atlasMetadataCid, options);
            const itemId = objectLayer.data.item.id;
            await IpfsClient.removeMfsPath(`/object-layer/${itemId}/${itemId}_atlas_sprite_sheet_metadata.json`);
            logger.info(`Cleaned up IPFS atlas metadata CID ${atlasMetadataCid} for ObjectLayer ${objectLayer._id}`);
          } catch (ipfsErr) {
            logger.warn(`Failed to clean up IPFS atlas metadata CID ${atlasMetadataCid}: ${ipfsErr.message}`);
          }
        }

        // Delete the atlas File document from MongoDB
        if (atlasDoc.fileId) {
          await File.findByIdAndDelete(atlasDoc.fileId);
        }
        // Delete the AtlasSpriteSheet document itself
        await AtlasSpriteSheet.findByIdAndDelete(atlasDoc._id);
      }
      objectLayer.atlasSpriteSheetId = undefined;
      if (!objectLayer.data.render) objectLayer.data.render = {};
      objectLayer.data.render.cid = '';
      objectLayer.data.render.metadataCid = '';
      objectLayer.markModified('data.render');
      await objectLayer.save();
    }

    return { success: true };
  },
  post: async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
    return await new AtlasSpriteSheet(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
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
  },
  put: async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
    return await AtlasSpriteSheet.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./atlas-sprite-sheet.model.js').AtlasSpriteSheetModel} */
    const AtlasSpriteSheet =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    if (req.params.id) {
      const atlasDoc = await AtlasSpriteSheet.findById(req.params.id);
      if (!atlasDoc) return null;

      // Remove pin records and unpin atlas CID from IPFS
      if (atlasDoc.cid) {
        try {
          await removePinRecordsAndUnpin(atlasDoc.cid, options);
          if (atlasDoc.metadata?.itemKey) {
            const itemKey = atlasDoc.metadata.itemKey;
            await IpfsClient.removeMfsPath(`/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`);
          }
          logger.info(`Cleaned up IPFS atlas CID ${atlasDoc.cid} for AtlasSpriteSheet ${atlasDoc._id}`);
        } catch (ipfsErr) {
          logger.warn(`Failed to clean up IPFS atlas CID ${atlasDoc.cid}: ${ipfsErr.message}`);
        }
      }

      // Delete the referenced File document (the atlas PNG blob)
      if (atlasDoc.fileId) {
        await File.findByIdAndDelete(atlasDoc.fileId);
      }

      return await AtlasSpriteSheet.findByIdAndDelete(req.params.id);
    } else {
      // Bulk delete: iterate each atlas to clean up File, IPFS pins, and pin records
      const allAtlases = await AtlasSpriteSheet.find({});
      for (const atlasDoc of allAtlases) {
        try {
          if (atlasDoc.cid) {
            await removePinRecordsAndUnpin(atlasDoc.cid, options);
            if (atlasDoc.metadata?.itemKey) {
              const itemKey = atlasDoc.metadata.itemKey;
              await IpfsClient.removeMfsPath(`/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`);
            }
          }
          if (atlasDoc.fileId) {
            await File.findByIdAndDelete(atlasDoc.fileId);
          }
        } catch (err) {
          logger.error(`Failed to clean up AtlasSpriteSheet ${atlasDoc._id} during bulk delete: ${err.message}`);
        }
      }
      return await AtlasSpriteSheet.deleteMany();
    }
  },
};

export { AtlasSpriteSheetService };
