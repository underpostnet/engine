/**
 * Object Layer service module for handling CRUD operations on object layer assets.
 * Provides REST API handlers for creating, reading, updating, and deleting object layers
 * including frame image management, metadata processing, and WebP animation generation.
 *
 * Delegates shared object layer creation and update logic to {@link ObjectLayerEngine} in
 * `src/server/object-layer.js` to keep a single source of truth shared with the Cyberia CLI.
 *
 * @module src/api/object-layer/object-layer.service.js
 * @namespace CyberiaObjectLayerService
 */

import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerRenderFramesDto } from '../object-layer-render-frames/object-layer-render-frames.model.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
import { ObjectLayerDto } from './object-layer.model.js';
import { ObjectLayerEngine } from '../../server/object-layer.js';
import { shellExec } from '../../server/process.js';
import { DataQuery } from '../../server/data-query.js';
import { AtlasSpriteSheetService } from '../atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { createPinRecord, removePinRecordsAndUnpin } from '../ipfs/ipfs.service.js';

/**
 * Logger instance for this module.
 * @type {Function}
 * @memberof CyberiaObjectLayerService
 * @private
 */
const logger = loggerFactory(import.meta);

/**
 * Object Layer Service providing REST API handlers for object layer operations.
 * @namespace CyberiaObjectLayerService.ObjectLayerService
 * @memberof CyberiaObjectLayerService
 */
const ObjectLayerService = {
  /**
   * POST handler for creating object layers and uploading frame images.
   *
   * Supports three sub-routes:
   * - `/frame-image/:itemType/:itemId/:directionCode` — Upload PNG frame images for a direction.
   * - `/metadata/:itemType/:itemId` — Create an object layer from uploaded frames and metadata.
   * - Default — Create an object layer directly from the request body.
   *
   * The `/metadata` and default routes delegate to {@link ObjectLayerEngine.createObjectLayerDocuments}
   * for centralized document creation, atlas generation, SHA-256 computation, and IPFS pinning.
   *
   * @async
   * @function post
   * @memberof CyberiaObjectLayerService.ObjectLayerService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The created object layer document or frame upload result.
   * @throws {Error} If file validation fails or required parameters are missing.
   */
  post: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */

    if (req.path.startsWith('/frame-image')) {
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const directionCode = req.params.directionCode;

      // Debug: Log request files structure
      logger.info(`POST Request files for direction ${directionCode}:`, {
        filesKeys: req.files ? Object.keys(req.files) : [],
        filesCount: req.files ? Object.keys(req.files).length : 0,
      });

      // Extract all frames for this direction
      const files = FileFactory.filesExtract(req);

      // Allow empty files to remove all frames from direction
      if (!files || files.length === 0) {
        logger.info(`No files received for direction ${directionCode} - will remove all frames from this direction`);
      } else {
        // Validate each file has data
        for (let i = 0; i < files.length; i++) {
          if (!files[i].data) {
            logger.error(`File ${files[i].name || i} has no data for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} has no data`);
          }
          if (!Buffer.isBuffer(files[i].data)) {
            logger.error(`File ${files[i].name || i} data is not a Buffer for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} data is not a Buffer`);
          }
        }
      }

      logger.info(
        `Processing ${files?.length || 0} file(s) for direction ${directionCode}: ${files?.map((f) => f.name).join(', ') || 'none'}`,
      );

      // Always clear and rewrite ALL frames for this direction code
      for (const basePath of ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`]) {
        const folder = `${basePath}assets/${itemType}/${itemId}/${directionCode}`;

        // Always remove entire direction folder to ensure clean state
        if (fs.existsSync(folder)) {
          await fs.remove(folder);
          logger.info(`Cleared folder: ${folder}`);
        }

        // Only create and write files if we have frames to upload
        if (files && files.length > 0) {
          // Create fresh folder
          fs.mkdirSync(folder, { recursive: true });

          // Write all frames sent in this request
          for (const file of files) {
            const filePath = `${folder}/${file.name}`;
            try {
              fs.writeFileSync(filePath, file.data);
              logger.info(`Wrote file: ${filePath} (${file.data.length} bytes)`);
            } catch (error) {
              logger.error(`Error writing file ${filePath}:`, error);
              throw new Error(`Failed to write ${file.name}: ${error.message}`);
            }
          }
        } else {
          logger.info(`No frames to write for direction ${directionCode} - folder removed`);
        }
      }

      logger.info(`Successfully processed ${files?.length || 0} frame(s) for direction ${directionCode}`);

      return { success: true, directionCode, frameCount: files?.length || 0 };
    }

    if (req.path.startsWith('/metadata')) {
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const folder = `./src/client/public/cyberia/assets/${itemType}/${itemId}`;
      const publicFolder = `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`;

      // Ensure both folders exist
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      if (!fs.existsSync(publicFolder)) fs.mkdirSync(publicFolder, { recursive: true });

      // Write metadata.json to both locations
      const metadataContent = JSON.stringify(req.body);
      fs.writeFileSync(`${folder}/metadata.json`, metadataContent);
      fs.writeFileSync(`${publicFolder}/metadata.json`, metadataContent);

      // Build object layer data from the asset directory using centralized logic
      const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
      const ObjectLayerRenderFrames =
        DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;

      const { objectLayerRenderFramesData, objectLayerData } =
        await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
          folder,
          objectLayerType: itemType,
          objectLayerId: itemId,
          metadataOverride: req.body,
        });

      // Create documents using centralized engine method (with atlas generation)
      const { objectLayer } = await ObjectLayerEngine.createObjectLayerDocuments({
        ObjectLayer,
        ObjectLayerRenderFrames,
        objectLayerRenderFramesData,
        objectLayerData,
        createOptions: {
          generateAtlas: true,
          atlasServiceContext: {
            req,
            res,
            options,
            AtlasSpriteSheetService,
            IpfsClient,
            createPinRecord,
          },
        },
      });

      return objectLayer;
    }

    // create object layer from body
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    let newObjectLayer = await new ObjectLayer(req.body).save();

    // Generate atlas sprite sheet – this sets data.render.cid and saves
    try {
      await AtlasSpriteSheetService.generate({ params: { id: newObjectLayer._id }, auth: req.auth }, res, options);
    } catch (atlasError) {
      logger.error('Failed to auto-generate atlas for new ObjectLayer:', atlasError);
    }

    // Re-read so data.render.cid is up-to-date, then recompute SHA-256 & IPFS CID
    newObjectLayer = await ObjectLayer.findById(newObjectLayer._id).populate('objectLayerRenderFramesId');
    if (newObjectLayer) {
      newObjectLayer = await ObjectLayerEngine.computeAndSaveFinalSha256({
        objectLayer: newObjectLayer,
        ipfsClient: IpfsClient,
        createPinRecord,
        userId: req.auth && req.auth.user ? req.auth.user._id : undefined,
        options,
      });
    }

    return newObjectLayer;
  },

  /**
   * GET handler for retrieving object layers.
   *
   * Supports multiple sub-routes:
   * - `/frame-counts/:id` — Get frame counts for each direction using numeric codes.
   * - `/render/:id` — Get only render data (populated ObjectLayerRenderFrames) for a specific object layer.
   * - `/metadata/:id` — Get metadata (no full render frames/colors) with atlas sprite sheet validation.
   * - `/:id` — Get a single object layer by ID.
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
  get: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;

    // GET /frame-counts/:id - Get frame counts for each direction using numeric codes
    if (req.path.startsWith('/frame-counts/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id)
        .select(ObjectLayerDto.select.getMetadata())
        .populate('objectLayerRenderFramesId');
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }

      const itemType = objectLayer.data.item.type;
      const itemId = objectLayer.data.item.id;
      const frameCounts = {};

      // Define numeric direction codes (as used in file system)
      const numericDirectionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];

      // Check each numeric direction code folder and count PNG files
      for (const numericCode of numericDirectionCodes) {
        const folder = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${numericCode}`;

        if (fs.existsSync(folder)) {
          try {
            const files = await fs.readdir(folder);
            const pngFiles = files.filter((file) => file.endsWith('.png'));
            frameCounts[numericCode] = pngFiles.length;
          } catch (error) {
            logger.warn(`Error reading folder ${folder}:`, error);
            frameCounts[numericCode] = 0;
          }
        } else {
          frameCounts[numericCode] = 0;
        }
      }

      return {
        _id: objectLayer._id,
        itemType,
        itemId,
        frameDuration: objectLayer.objectLayerRenderFramesId?.frame_duration || 250,
        frameCounts,
      };
    }

    // GET /render/:id - Get only render data for specific object layer
    if (req.path.startsWith('/render/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id)
        .select(ObjectLayerDto.select.getRender())
        .populate('objectLayerRenderFramesId');
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }
      // Return the populated render frames data with consistent naming
      return {
        _id: objectLayer._id,
        objectLayerRenderFramesId: objectLayer.objectLayerRenderFramesId,
      };
    }

    // GET /metadata/:id - Get only metadata (no render frames/colors) for specific object layer
    if (req.path.startsWith('/metadata/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id)
        .select(ObjectLayerDto.select.getMetadata())
        .populate('objectLayerRenderFramesId', ObjectLayerRenderFramesDto.select.get());
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }

      // If object layer references an atlas sprite sheet, validate that the atlas and its file actually exist.
      // If the atlas or its file is missing, clear the reference so the UI can offer to generate a new atlas.
      if (objectLayer.atlasSpriteSheetId) {
        try {
          const AtlasSpriteSheet =
            DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.AtlasSpriteSheet;
          const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

          const atlasDoc = await AtlasSpriteSheet.findById(objectLayer.atlasSpriteSheetId);

          // If the atlas doc is gone, clear the reference
          if (!atlasDoc) {
            logger.warn(
              `ObjectLayer ${objectLayer._id} referenced missing AtlasSpriteSheet ${objectLayer.atlasSpriteSheetId} - clearing reference`,
            );
            objectLayer.atlasSpriteSheetId = undefined;
            await objectLayer.save();
          } else if (!atlasDoc.fileId) {
            // Atlas exists but has no fileId - remove atlas and clear reference
            logger.warn(
              `AtlasSpriteSheet ${atlasDoc._id} has no fileId - deleting atlas and clearing ObjectLayer reference`,
            );
            await AtlasSpriteSheet.findByIdAndDelete(atlasDoc._id);
            objectLayer.atlasSpriteSheetId = undefined;
            await objectLayer.save();
          } else {
            // Atlas has a fileId - verify the File exists
            const fileDoc = await File.findById(atlasDoc.fileId);
            if (!fileDoc) {
              logger.warn(
                `AtlasSpriteSheet ${atlasDoc._id} references missing File ${atlasDoc.fileId} - deleting atlas and clearing reference on ObjectLayer ${objectLayer._id}`,
              );
              await AtlasSpriteSheet.findByIdAndDelete(atlasDoc._id);
              objectLayer.atlasSpriteSheetId = undefined;
              await objectLayer.save();
            }
          }
        } catch (err) {
          logger.warn('Error validating atlas sprite sheet reference:', err);
        }
      }

      return objectLayer;
    }

    // GET / - Get paginated list of object layers
    const id = req.params.id || req.query.id;
    logger.info(`ObjectLayerService.get - filtering check - id: ${id}`);
    if (id && id !== 'undefined' && !['render', 'metadata', 'frame-counts'].includes(id)) {
      try {
        const objectLayer = await ObjectLayer.findById(id)
          .select(ObjectLayerDto.select.get())
          .populate('atlasSpriteSheetId', 'cid')
          .populate('objectLayerRenderFramesId', ObjectLayerRenderFramesDto.select.get());
        if (objectLayer) {
          logger.info(`ObjectLayerService.get - found record by id: ${id}`);
          return { data: [objectLayer], total: 1, page: 1, totalPages: 1 };
        }
        logger.warn(`ObjectLayerService.get - record NOT found for id: ${id}`);
      } catch (e) {
        logger.warn(`Invalid ID format or not found: ${id}`);
      }
    }

    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      ObjectLayer.find(query) // { userId: req.auth.user._id }
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .select(ObjectLayerDto.select.get())
        .populate('atlasSpriteSheetId', 'cid')
        .populate('objectLayerRenderFramesId', ObjectLayerRenderFramesDto.select.get()),
      ObjectLayer.countDocuments(query), // { userId: req.auth.user._id }
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  },

  /**
   * Generates a WebP animation from PNG frame images for a specific direction of an object layer.
   * Uses the `img2webp` CLI tool to assemble the animation.
   *
   * @async
   * @function generateWebp
   * @memberof CyberiaObjectLayerService.ObjectLayerService
   * @param {Object} req - Express request object with params: itemType, itemId, directionCode.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Buffer>} The generated WebP animation as a Buffer.
   * @throws {Error} If required parameters are missing, frames directory is not found, or img2webp fails.
   */
  generateWebp: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;

    // GET /generate-webp/:itemType/:itemId/:directionCode - Generate webp animation from PNG frames
    const itemType = req.params.itemType;
    const itemId = req.params.itemId;
    const directionCode = req.params.directionCode;

    if (!itemType || !itemId || !directionCode) {
      throw new Error('Missing required parameters: itemType, itemId, directionCode');
    }

    // Path to the PNG frames directory
    const framesFolder = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${directionCode}`;

    // Check if the folder exists
    if (!fs.existsSync(framesFolder)) {
      throw new Error(`Frames directory not found: ${framesFolder}`);
    }

    // Check if there are PNG files in the directory
    const files = await fs.readdir(framesFolder);
    const pngFiles = files.filter((file) => file.endsWith('.png')).sort();

    if (pngFiles.length === 0) {
      throw new Error(`No PNG frames found in directory: ${framesFolder}`);
    }

    logger.info(`Found ${pngFiles.length} PNG frames in ${framesFolder}`);

    // Get frame duration from the object layer metadata
    let frameDuration = 100; // Default to 100ms

    try {
      // Find object layer by itemType and itemId
      const objectLayer = await ObjectLayer.findOne({
        'data.item.type': itemType,
        'data.item.id': itemId,
      })
        .select(ObjectLayerDto.select.getMetadata())
        .populate('objectLayerRenderFramesId');

      if (objectLayer && objectLayer.objectLayerRenderFramesId?.frame_duration) {
        frameDuration = objectLayer.objectLayerRenderFramesId.frame_duration;
        logger.info(`Using frame duration from object layer: ${frameDuration}ms`);
      } else {
        logger.warn(`Object layer not found or no frame_duration set, using default: ${frameDuration}ms`);
      }
    } catch (error) {
      logger.warn(
        `Error fetching object layer metadata: ${error.message}. Using default frame duration: ${frameDuration}ms`,
      );
    }

    const tmpOutputFileName = `output_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`;

    // Create temporary output file path
    const tempOutputPath = `${framesFolder}/${tmpOutputFileName}`;

    try {
      // Change to the frames directory and execute img2webp command
      const cmd = `cd "${framesFolder}" && img2webp -d ${frameDuration} -loop 0 *.png -o ${tmpOutputFileName}`;

      logger.info(`Executing command: ${cmd}`);

      const result = shellExec(cmd, { silent: false });

      if (result.code !== 0) {
        throw new Error(`img2webp command failed: ${result.stderr || result.stdout}`);
      }

      logger.info(`Successfully generated webp: ${tempOutputPath}`);

      // Check if the output file was created
      if (!fs.existsSync(tempOutputPath)) {
        throw new Error(`Output file was not created: ${tempOutputPath}`);
      }

      // Read the webp file as a buffer
      const webpBuffer = await fs.readFile(tempOutputPath);

      logger.info(`WebP file size: ${webpBuffer.length} bytes`);

      // Delete the temporary file after sending the response
      // Use setImmediate to ensure the response is fully sent before cleanup
      setImmediate(async () => {
        try {
          if (fs.existsSync(tempOutputPath)) {
            await fs.remove(tempOutputPath);
            logger.info(`Cleaned up temporary file: ${tempOutputPath}`);
          }
        } catch (cleanupError) {
          logger.error(`Error cleaning up temporary file: ${cleanupError.message}`);
        }
      });

      return webpBuffer;
    } catch (error) {
      // Clean up on error
      try {
        if (fs.existsSync(tempOutputPath)) {
          await fs.remove(tempOutputPath);
          logger.info(`Cleaned up temporary file after error: ${tempOutputPath}`);
        }
      } catch (cleanupError) {
        logger.error(`Error cleaning up temporary file after error: ${cleanupError.message}`);
      }

      throw error;
    }
  },

  /**
   * PUT handler for updating object layers, their frame images, and metadata.
   *
   * Supports three sub-routes:
   * - `/:id/frame-image/:itemType/:itemId/:directionCode` — Replace frame images for a direction.
   * - `/:id/metadata/:itemType/:itemId` — Update metadata and reprocess all frames.
   * - `/:id` — Standard update from request body.
   *
   * The `/metadata` route delegates to {@link ObjectLayerEngine.updateObjectLayerDocuments}
   * for centralized document update, atlas regeneration, SHA-256 computation, and IPFS pinning.
   *
   * @async
   * @function put
   * @memberof CyberiaObjectLayerService.ObjectLayerService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The updated object layer document or frame upload result.
   * @throws {Error} If file validation fails, object layer is not found, or required parameters are missing.
   */
  put: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;

    // PUT /:id/frame-image/:itemType/:itemId/:directionCode - Update frame images for specific direction
    if (req.path.includes('/frame-image/')) {
      const objectLayerId = req.params.id;
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const directionCode = req.params.directionCode;

      // Debug: Log request files structure
      logger.info(`Request files for direction ${directionCode}:`, {
        filesKeys: req.files ? Object.keys(req.files) : [],
        filesCount: req.files ? Object.keys(req.files).length : 0,
      });

      // Extract all frames for this direction
      const files = FileFactory.filesExtract(req);

      // Allow empty files to remove all frames from direction
      if (!files || files.length === 0) {
        logger.info(`No files received for direction ${directionCode} - will remove all frames from this direction`);
      } else {
        // Validate each file has data
        for (let i = 0; i < files.length; i++) {
          if (!files[i].data) {
            logger.error(`File ${files[i].name || i} has no data for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} has no data`);
          }
          if (!Buffer.isBuffer(files[i].data)) {
            logger.error(`File ${files[i].name || i} data is not a Buffer for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} data is not a Buffer`);
          }
        }
      }

      logger.info(
        `Processing ${files?.length || 0} file(s) for direction ${directionCode}: ${files?.map((f) => f.name).join(', ') || 'none'}`,
      );

      // Always clear and rewrite ALL frames for this direction code
      for (const basePath of ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`]) {
        const folder = `${basePath}assets/${itemType}/${itemId}/${directionCode}`;

        // Always remove entire direction folder to ensure clean state
        if (fs.existsSync(folder)) {
          await fs.remove(folder);
          logger.info(`Cleared folder: ${folder}`);
        }

        // Only create and write files if we have frames to upload
        if (files && files.length > 0) {
          // Create fresh folder
          fs.mkdirSync(folder, { recursive: true });

          // Write all frames sent in this request
          for (const file of files) {
            const filePath = `${folder}/${file.name}`;
            try {
              fs.writeFileSync(filePath, file.data);
              logger.info(`Wrote file: ${filePath}`);
            } catch (error) {
              logger.error(`Error writing file ${filePath}:`, error);
              throw new Error(`Failed to write ${file.name}: ${error.message}`);
            }
          }
        } else {
          logger.info(`No frames to write for direction ${directionCode} - folder removed`);
        }
      }

      logger.info(
        `Successfully processed ${files?.length || 0} frame(s) for direction ${directionCode} in object layer ${objectLayerId}`,
      );

      return { success: true, directionCode, frameCount: files?.length || 0 };
    }

    // PUT /:id/metadata/:itemType/:itemId - Update object layer metadata and reprocess all frames
    if (req.path.includes('/metadata/')) {
      const objectLayerId = req.params.id;
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;

      const folder = `./src/client/public/cyberia/assets/${itemType}/${itemId}`;
      const publicFolder = `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`;

      // Ensure both folders exist
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      if (!fs.existsSync(publicFolder)) {
        fs.mkdirSync(publicFolder, { recursive: true });
      }

      // Write metadata.json to both locations
      const metadataContent = JSON.stringify(req.body);
      fs.writeFileSync(`${folder}/metadata.json`, metadataContent);
      fs.writeFileSync(`${publicFolder}/metadata.json`, metadataContent);

      const ObjectLayerRenderFrames =
        DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;

      // Build object layer data from the asset directory using centralized logic
      const { objectLayerRenderFramesData, objectLayerData } =
        await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
          folder,
          objectLayerType: itemType,
          objectLayerId: itemId,
          metadataOverride: req.body,
        });

      // Update documents using centralized engine method (with atlas generation)
      const { objectLayer } = await ObjectLayerEngine.updateObjectLayerDocuments({
        objectLayerId,
        ObjectLayer,
        ObjectLayerRenderFrames,
        objectLayerRenderFramesData,
        objectLayerData,
        updateOptions: {
          generateAtlas: true,
          atlasServiceContext: {
            req,
            res,
            options,
            AtlasSpriteSheetService,
            IpfsClient,
            createPinRecord,
          },
        },
      });

      return objectLayer;
    }

    // PUT /:id - Standard update
    let updatedObjectLayer = await ObjectLayer.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

    if (updatedObjectLayer) {
      // Generate atlas sprite sheet – this sets data.render.cid and saves
      try {
        await AtlasSpriteSheetService.generate({ params: { id: req.params.id }, auth: req.auth }, res, options);
      } catch (atlasError) {
        logger.error('Failed to auto-update atlas for ObjectLayer:', atlasError);
      }

      // Re-read so data.render.cid is up-to-date, then recompute SHA-256 & IPFS CID
      updatedObjectLayer = await ObjectLayer.findById(req.params.id).populate('objectLayerRenderFramesId');
      if (updatedObjectLayer) {
        updatedObjectLayer = await ObjectLayerEngine.computeAndSaveFinalSha256({
          objectLayer: updatedObjectLayer,
          ipfsClient: IpfsClient,
          createPinRecord,
          userId: req.auth && req.auth.user ? req.auth.user._id : undefined,
          options,
        });
      }
    }

    return updatedObjectLayer;
  },

  /**
   * DELETE handler for removing object layers and all associated resources.
   *
   * When a specific ID is provided, performs a cascading delete that removes:
   * 1. The AtlasSpriteSheet and its File document.
   * 2. The ObjectLayerRenderFrames document.
   * 3. IPFS pin records and CIDs (both data JSON and atlas PNG).
   * 4. The MFS directory for this object layer.
   * 5. Static asset files from disk.
   * 6. The ObjectLayer document itself.
   *
   * When no ID is provided, performs a bulk delete of all object layers.
   *
   * @async
   * @function delete
   * @memberof CyberiaObjectLayerService.ObjectLayerService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The deleted object layer document or bulk delete count.
   * @throws {Error} If the object layer is not found.
   */
  delete: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;

    if (req.params.id) {
      // Load the full object layer so we can access all references
      const objectLayer = await ObjectLayer.findById(req.params.id);
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }

      const itemType = objectLayer.data?.item?.type;
      const itemId = objectLayer.data?.item?.id;

      // ── 1. Clean up AtlasSpriteSheet, its File, and atlas IPFS CID ──
      try {
        await AtlasSpriteSheetService.deleteByObjectLayerId(req, res, options);
      } catch (atlasError) {
        logger.error('Failed to clean up atlas during ObjectLayer deletion:', atlasError);
      }

      // ── 2. Clean up ObjectLayerRenderFrames document ──
      if (objectLayer.objectLayerRenderFramesId) {
        try {
          await ObjectLayerRenderFrames.findByIdAndDelete(objectLayer.objectLayerRenderFramesId);
          logger.info(
            `Deleted ObjectLayerRenderFrames ${objectLayer.objectLayerRenderFramesId} for ObjectLayer ${req.params.id}`,
          );
        } catch (renderFramesError) {
          logger.error('Failed to delete ObjectLayerRenderFrames:', renderFramesError);
        }
      }

      // ── 3. Remove pin records and unpin object layer data JSON CID from IPFS ──
      if (objectLayer.cid) {
        try {
          await removePinRecordsAndUnpin(objectLayer.cid, options);
          logger.info(`Cleaned up IPFS data CID ${objectLayer.cid} for ObjectLayer ${req.params.id}`);
        } catch (ipfsError) {
          logger.warn(`Failed to clean up IPFS data CID ${objectLayer.cid}: ${ipfsError.message}`);
        }
      }

      // ── 4. Remove MFS directory for this object layer (covers both data JSON and atlas PNG) ──
      if (itemId) {
        try {
          await IpfsClient.removeMfsPath(`/object-layer/${itemId}`);
          logger.info(`Removed MFS directory /object-layer/${itemId}`);
        } catch (mfsError) {
          logger.warn(`Failed to remove MFS path /object-layer/${itemId}: ${mfsError.message}`);
        }
      }

      // ── 5. Remove static asset files from disk ──
      if (itemType && itemId) {
        const staticPaths = [
          `./src/client/public/cyberia/assets/${itemType}/${itemId}`,
          `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`,
        ];
        for (const assetDir of staticPaths) {
          try {
            if (fs.existsSync(assetDir)) {
              await fs.remove(assetDir);
              logger.info(`Removed static asset directory: ${assetDir}`);
            }
          } catch (fsError) {
            logger.warn(`Failed to remove static asset directory ${assetDir}: ${fsError.message}`);
          }
        }
      }

      // ── 6. Delete the ObjectLayer document itself ──
      const deleted = await ObjectLayer.findByIdAndDelete(req.params.id);
      logger.info(`ObjectLayer ${req.params.id} and all associated resources deleted successfully`);
      return deleted;
    } else {
      // Bulk delete: clean up all object layers
      const allObjectLayers = await ObjectLayer.find({});
      for (const ol of allObjectLayers) {
        try {
          await ObjectLayerService.delete({ params: { id: ol._id.toString() }, auth: req.auth }, res, options);
        } catch (err) {
          logger.error(`Failed to delete ObjectLayer ${ol._id} during bulk delete: ${err.message}`);
        }
      }
      return { deletedCount: allObjectLayers.length };
    }
  },
};

export { ObjectLayerService };
