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

    const objectLayer = await ObjectLayer.findById(req.params.id);
    if (!objectLayer) {
      throw new Error('ObjectLayer not found');
    }

    if (objectLayer.atlasSpriteSheetId) {
      const atlasDoc = await AtlasSpriteSheet.findById(objectLayer.atlasSpriteSheetId);
      if (atlasDoc) {
        if (atlasDoc.fileId) {
          await File.findByIdAndDelete(atlasDoc.fileId);
        }
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
    if (req.params.id) return await AtlasSpriteSheet.findByIdAndDelete(req.params.id);
    else return await AtlasSpriteSheet.deleteMany();
  },
};

export { AtlasSpriteSheetService };
