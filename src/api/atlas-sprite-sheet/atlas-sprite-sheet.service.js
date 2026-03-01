import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { AtlasSpriteSheetGenerator } from '../../server/atlas-sprite-sheet-generator.js';
import { FileFactory } from '../file/file.service.js';
import { AtlasSpriteSheetDto } from './atlas-sprite-sheet.model.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { createPinRecord } from '../ipfs/ipfs.service.js';

const logger = loggerFactory(import.meta);

const AtlasSpriteSheetService = {
  generate: async (req, res, options) => {
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
    try {
      const ipfsResult = await IpfsClient.addBufferToIpfs(
        buffer,
        `${itemKey}_atlas_sprite_sheet.png`,
        `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
      );
      if (ipfsResult) {
        atlasCid = ipfsResult.cid;
        // Create pin record for the authenticated user (when available)
        const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
        if (userId) {
          await createPinRecord({ cid: atlasCid, userId, pinType: 'recursive', options });
        }
        logger.info(`Atlas sprite sheet pinned to IPFS – CID: ${atlasCid}`);
      }
    } catch (ipfsError) {
      logger.warn('Failed to add atlas sprite sheet to IPFS:', ipfsError.message);
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

    objectLayer.atlasSpriteSheetId = atlasDoc._id;
    objectLayer.data.atlasSpriteSheetCid = atlasCid;
    objectLayer.markModified('data.atlasSpriteSheetCid');
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
    /** @type {import('../ipfs/ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    const objectLayer = await ObjectLayer.findById(req.params.id);
    if (!objectLayer) {
      throw new Error('ObjectLayer not found');
    }

    if (objectLayer.atlasSpriteSheetId) {
      const atlasDoc = await AtlasSpriteSheet.findById(objectLayer.atlasSpriteSheetId);
      if (atlasDoc) {
        // Unpin atlas CID from IPFS node/cluster and remove MFS entry + DB pin records
        const atlasCid = atlasDoc.cid || objectLayer.data.atlasSpriteSheetCid;
        if (atlasCid) {
          try {
            // Check if any other pin records reference this CID before unpinning from the node
            const othersCount = await Ipfs.countDocuments({ cid: atlasCid });
            // Remove all pin records for this CID (they belong to the object layer being deleted)
            await Ipfs.deleteMany({ cid: atlasCid });
            // Only unpin from the IPFS node when no other records remain
            if (othersCount <= 1) {
              await IpfsClient.unpinCid(atlasCid);
            }
            // Remove the MFS entry for the atlas sprite sheet PNG
            const itemId = objectLayer.data.item.id;
            await IpfsClient.removeMfsPath(`/object-layer/${itemId}/${itemId}_atlas_sprite_sheet.png`);
            logger.info(`Cleaned up IPFS atlas CID ${atlasCid} for ObjectLayer ${objectLayer._id}`);
          } catch (ipfsErr) {
            logger.warn(`Failed to clean up IPFS atlas CID ${atlasCid}: ${ipfsErr.message}`);
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
      objectLayer.data.atlasSpriteSheetCid = '';
      objectLayer.markModified('data.atlasSpriteSheetCid');
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
    /** @type {import('../ipfs/ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    if (req.params.id) {
      const atlasDoc = await AtlasSpriteSheet.findById(req.params.id);
      if (!atlasDoc) return null;

      // Clean up IPFS pin + pin records + MFS entry for the atlas CID
      if (atlasDoc.cid) {
        try {
          const othersCount = await Ipfs.countDocuments({ cid: atlasDoc.cid });
          await Ipfs.deleteMany({ cid: atlasDoc.cid });
          if (othersCount <= 1) {
            await IpfsClient.unpinCid(atlasDoc.cid);
          }
          // Attempt to remove MFS entry using the itemKey from metadata
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
            const othersCount = await Ipfs.countDocuments({ cid: atlasDoc.cid });
            await Ipfs.deleteMany({ cid: atlasDoc.cid });
            if (othersCount <= 1) {
              await IpfsClient.unpinCid(atlasDoc.cid);
            }
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
