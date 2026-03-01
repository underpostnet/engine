import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerRenderFramesDto } from '../object-layer-render-frames/object-layer-render-frames.model.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { ObjectLayerDto } from './object-layer.model.js';
import { ObjectLayerEngine } from '../../server/object-layer.js';
import { shellExec } from '../../server/process.js';
import { DataQuery } from '../../server/data-query.js';
import { AtlasSpriteSheetService } from '../atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { createPinRecord, removePinRecordsAndUnpin } from '../ipfs/ipfs.service.js';

const logger = loggerFactory(import.meta);

const ObjectLayerService = {
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
      const folder = `./src/client/public/cyberia/assets/${req.params.itemType}/${req.params.itemId}`;
      const publicFolder = `./public/${options.host}${options.path}/assets/${req.params.itemType}/${req.params.itemId}`;

      // Ensure both folders exist
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      if (!fs.existsSync(publicFolder)) fs.mkdirSync(publicFolder, { recursive: true });

      // Write metadata.json to both locations
      const metadataContent = JSON.stringify(req.body);
      fs.writeFileSync(`${folder}/metadata.json`, metadataContent);
      fs.writeFileSync(`${publicFolder}/metadata.json`, metadataContent);

      // Create object layer from PNG saved and metadata
      const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
      const ObjectLayerRenderFrames =
        DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;

      const objectLayerRenderFramesData = {
        frame_duration: req.body.objectLayerRenderFramesData.frame_duration,
        is_stateless: req.body.objectLayerRenderFramesData.is_stateless,
        frames: {},
        colors: [],
      };

      const objectLayerData = {
        data: {
          item: req.body.data.item,
          stats: req.body.data.stats,
          seed: crypto.randomUUID(),
        },
      };

      // Process all PNG files to generate frames and colors
      const directionFolders = await fs.readdir(folder);
      for (const directionCode of directionFolders) {
        const directionPath = `${folder}/${directionCode}`;
        if (!fs.statSync(directionPath).isDirectory()) continue;

        const frameFiles = await fs.readdir(directionPath);
        // Sort frame files numerically
        frameFiles.sort((a, b) => {
          const numA = parseInt(a.split('.')[0]);
          const numB = parseInt(b.split('.')[0]);
          return numA - numB;
        });

        for (const frameFile of frameFiles) {
          if (!frameFile.endsWith('.png')) continue;

          const framePath = `${directionPath}/${frameFile}`;

          // Process image and push frame to render data with color palette management
          await ObjectLayerEngine.processAndPushFrame(objectLayerRenderFramesData, framePath, directionCode);
        }
      }

      // Create ObjectLayerRenderFrames document
      const objectLayerRenderFramesDoc = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);

      // Add reference to render frames (top-level, not in data)
      objectLayerData.objectLayerRenderFramesId = objectLayerRenderFramesDoc._id;

      // Use a temporary SHA-256 so we can save the ObjectLayer first,
      // then generate the atlas (which sets data.atlasSpriteSheetCid),
      // and finally recompute the definitive SHA-256 & IPFS CID.
      objectLayerData.data.atlasSpriteSheetCid = '';
      objectLayerData.sha256 = crypto.createHash('sha256').update(stringify(objectLayerData.data)).digest('hex');

      // Save or update ObjectLayer in MongoDB (temporary – without atlas CID)
      let objectLayer;
      try {
        const existingObjectLayer = await ObjectLayer.findOne({ sha256: objectLayerData.sha256 });
        if (existingObjectLayer) {
          logger.info(`ObjectLayer with sha256 ${objectLayerData.sha256} already exists, updating...`);
          objectLayer = await ObjectLayer.findByIdAndUpdate(existingObjectLayer._id, objectLayerData, {
            new: true,
          }).populate('objectLayerRenderFramesId');
        } else {
          objectLayer = await (await ObjectLayer.create(objectLayerData)).populate('objectLayerRenderFramesId');
          logger.info(`ObjectLayer created successfully with id: ${objectLayer._id}`);
        }
      } catch (error) {
        logger.error('Error creating ObjectLayer:', error);
        throw error;
      }

      // Generate atlas sprite sheet – this sets objectLayer.data.atlasSpriteSheetCid and saves
      try {
        await AtlasSpriteSheetService.generate(
          { params: { id: objectLayer._id }, objectLayer, auth: req.auth },
          res,
          options,
        );
      } catch (atlasError) {
        logger.error('Failed to auto-generate atlas for ObjectLayer:', atlasError);
      }

      // Re-read the objectLayer so data.atlasSpriteSheetCid is up-to-date
      objectLayer = await ObjectLayer.findById(objectLayer._id).populate('objectLayerRenderFramesId');

      // Now that data includes atlasSpriteSheetCid, compute the definitive SHA-256 and IPFS CID
      const finalSha256 = crypto.createHash('sha256').update(stringify(objectLayer.data)).digest('hex');

      try {
        const itemId = objectLayer.data.item.id;
        const ipfsResult = await IpfsClient.addJsonToIpfs(
          objectLayer.data,
          `${itemId}_data.json`,
          `/object-layer/${itemId}/${itemId}_data.json`,
        );
        if (ipfsResult) {
          objectLayer.cid = ipfsResult.cid;
          const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
          if (userId) {
            await createPinRecord({ cid: ipfsResult.cid, userId, options });
          }
        }
      } catch (ipfsError) {
        logger.warn('Failed to add object layer data to IPFS:', ipfsError.message);
      }

      objectLayer.sha256 = finalSha256;
      objectLayer.markModified('data');
      await objectLayer.save();

      return objectLayer;
    }

    // create object layer from body
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    let newObjectLayer = await new ObjectLayer(req.body).save();

    // Generate atlas sprite sheet – this sets data.atlasSpriteSheetCid and saves
    try {
      await AtlasSpriteSheetService.generate({ params: { id: newObjectLayer._id }, auth: req.auth }, res, options);
    } catch (atlasError) {
      logger.error('Failed to auto-generate atlas for new ObjectLayer:', atlasError);
    }

    // Re-read so data.atlasSpriteSheetCid is up-to-date, then recompute SHA-256 & IPFS CID
    newObjectLayer = await ObjectLayer.findById(newObjectLayer._id).populate('objectLayerRenderFramesId');
    if (newObjectLayer) {
      const finalSha256 = crypto.createHash('sha256').update(stringify(newObjectLayer.data)).digest('hex');
      try {
        const itemId = newObjectLayer.data.item.id;
        const ipfsResult = await IpfsClient.addJsonToIpfs(
          newObjectLayer.data,
          `${itemId}_data.json`,
          `/object-layer/${itemId}/${itemId}_data.json`,
        );
        if (ipfsResult) {
          newObjectLayer.cid = ipfsResult.cid;
          const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
          if (userId) {
            await createPinRecord({ cid: ipfsResult.cid, userId, options });
          }
        }
      } catch (ipfsError) {
        logger.warn('Failed to add object layer data to IPFS:', ipfsError.message);
      }
      newObjectLayer.sha256 = finalSha256;
      newObjectLayer.markModified('data');
      await newObjectLayer.save();
    }

    return newObjectLayer;
  },
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

      const objectLayerRenderFramesData = {
        frame_duration: req.body.objectLayerRenderFramesData.frame_duration,
        is_stateless: req.body.objectLayerRenderFramesData.is_stateless,
        frames: {},
        colors: [],
      };

      const objectLayerData = {
        data: {
          item: req.body.data.item,
          stats: req.body.data.stats,
          seed: req.body.data.seed || crypto.randomUUID(),
        },
      };

      // Process all PNG files from direction folders (uploaded via /frame-image/)
      const directionFolders = await fs.readdir(folder);
      for (const directionCode of directionFolders) {
        const directionPath = `${folder}/${directionCode}`;

        // Skip non-directories (like metadata.json)
        try {
          const stat = await fs.stat(directionPath);
          if (!stat.isDirectory()) continue;
        } catch (error) {
          logger.warn(`Skipping ${directionCode}: ${error.message}`);
          continue;
        }

        const frameFiles = await fs.readdir(directionPath);
        // Sort frame files numerically
        frameFiles.sort((a, b) => {
          const numA = parseInt(a.split('.')[0]);
          const numB = parseInt(b.split('.')[0]);
          return numA - numB;
        });

        for (const frameFile of frameFiles) {
          if (!frameFile.endsWith('.png')) continue;

          const framePath = `${directionPath}/${frameFile}`;

          // Process image and push frame to render data with color palette management
          await ObjectLayerEngine.processAndPushFrame(objectLayerRenderFramesData, framePath, directionCode);
        }
      }

      // Update or create ObjectLayerRenderFrames document
      const existingObjectLayer = await ObjectLayer.findById(objectLayerId);
      if (existingObjectLayer && existingObjectLayer.objectLayerRenderFramesId) {
        // Update existing render frames
        await ObjectLayerRenderFrames.findByIdAndUpdate(
          existingObjectLayer.objectLayerRenderFramesId,
          objectLayerRenderFramesData,
        );
        objectLayerData.objectLayerRenderFramesId = existingObjectLayer.objectLayerRenderFramesId;
      } else {
        // Create new render frames document
        const objectLayerRenderFramesDoc = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);
        objectLayerData.objectLayerRenderFramesId = objectLayerRenderFramesDoc._id;
      }

      // Use a temporary SHA-256 so we can save the ObjectLayer first,
      // then generate the atlas (which sets data.atlasSpriteSheetCid),
      // and finally recompute the definitive SHA-256 & IPFS CID.
      objectLayerData.data.atlasSpriteSheetCid = '';
      objectLayerData.sha256 = crypto.createHash('sha256').update(stringify(objectLayerData.data)).digest('hex');

      // Save to MongoDB (temporary – without atlas CID)
      let updatedObjectLayer;
      try {
        updatedObjectLayer = await ObjectLayer.findByIdAndUpdate(objectLayerId, objectLayerData, {
          new: true,
        }).populate('objectLayerRenderFramesId');
        if (!updatedObjectLayer) {
          throw new Error('ObjectLayer not found for update');
        }
        logger.info(`ObjectLayer updated successfully with id: ${objectLayerId}`);
      } catch (error) {
        logger.error('Error updating ObjectLayer:', error);
        throw error;
      }

      // Generate atlas sprite sheet – this sets updatedObjectLayer.data.atlasSpriteSheetCid and saves
      try {
        await AtlasSpriteSheetService.generate(
          { params: { id: objectLayerId }, objectLayer: updatedObjectLayer, auth: req.auth },
          res,
          options,
        );
      } catch (atlasError) {
        logger.error('Failed to auto-update atlas for ObjectLayer:', atlasError);
      }

      // Re-read the objectLayer so data.atlasSpriteSheetCid is up-to-date
      updatedObjectLayer = await ObjectLayer.findById(objectLayerId).populate('objectLayerRenderFramesId');

      // Now that data includes atlasSpriteSheetCid, compute the definitive SHA-256 and IPFS CID
      const finalSha256 = crypto.createHash('sha256').update(stringify(updatedObjectLayer.data)).digest('hex');

      try {
        const itemId = updatedObjectLayer.data.item.id;
        const ipfsResult = await IpfsClient.addJsonToIpfs(
          updatedObjectLayer.data,
          `${itemId}_data.json`,
          `/object-layer/${itemId}/${itemId}_data.json`,
        );
        if (ipfsResult) {
          updatedObjectLayer.cid = ipfsResult.cid;
          const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
          if (userId) {
            await createPinRecord({ cid: ipfsResult.cid, userId, options });
          }
        }
      } catch (ipfsError) {
        logger.warn('Failed to add object layer data to IPFS:', ipfsError.message);
      }

      updatedObjectLayer.sha256 = finalSha256;
      updatedObjectLayer.markModified('data');
      await updatedObjectLayer.save();

      return updatedObjectLayer;
    }

    // PUT /:id - Standard update
    let updatedObjectLayer = await ObjectLayer.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (updatedObjectLayer) {
      // Generate atlas sprite sheet – this sets data.atlasSpriteSheetCid and saves
      try {
        await AtlasSpriteSheetService.generate({ params: { id: req.params.id }, auth: req.auth }, res, options);
      } catch (atlasError) {
        logger.error('Failed to auto-update atlas for ObjectLayer:', atlasError);
      }

      // Re-read so data.atlasSpriteSheetCid is up-to-date, then recompute SHA-256 & IPFS CID
      updatedObjectLayer = await ObjectLayer.findById(req.params.id).populate('objectLayerRenderFramesId');
      if (updatedObjectLayer) {
        const finalSha256 = crypto.createHash('sha256').update(stringify(updatedObjectLayer.data)).digest('hex');
        try {
          const itemId = updatedObjectLayer.data.item.id;
          const ipfsResult = await IpfsClient.addJsonToIpfs(
            updatedObjectLayer.data,
            `${itemId}_data.json`,
            `/object-layer/${itemId}/${itemId}_data.json`,
          );
          if (ipfsResult) {
            updatedObjectLayer.cid = ipfsResult.cid;
            const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
            if (userId) {
              await createPinRecord({ cid: ipfsResult.cid, userId, options });
            }
          }
        } catch (ipfsError) {
          logger.warn('Failed to add object layer data to IPFS:', ipfsError.message);
        }
        updatedObjectLayer.sha256 = finalSha256;
        updatedObjectLayer.markModified('data');
        await updatedObjectLayer.save();
      }
    }

    return updatedObjectLayer;
  },
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
