import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
import crypto from 'crypto';
import { ObjectLayerDto } from './object-layer.model.js';
import { ObjectLayerEngine } from '../../server/object-layer.js';
import { shellExec } from '../../server/process.js';
import { DataQuery } from '../../server/data-query.js';
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

      const objectLayerData = {
        data: {
          render: {
            frame_duration: req.body.data.render.frame_duration,
            is_stateless: req.body.data.render.is_stateless,
            frames: {},
            colors: [],
          },
          item: req.body.data.item,
          stats: req.body.data.stats,
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
          await ObjectLayerEngine.processAndPushFrame(objectLayerData.data.render, framePath, directionCode);
        }
      }

      // Generate SHA256 hash
      objectLayerData.sha256 = crypto.createHash('sha256').update(JSON.stringify(objectLayerData.data)).digest('hex');

      // Save to MongoDB
      try {
        const existingObjectLayer = await ObjectLayer.findOne({ sha256: objectLayerData.sha256 });
        if (existingObjectLayer) {
          logger.info(`ObjectLayer with sha256 ${objectLayerData.sha256} already exists, updating...`);
          return await ObjectLayer.findByIdAndUpdate(existingObjectLayer._id, objectLayerData, { new: true });
        }
        const newObjectLayer = await ObjectLayer.create(objectLayerData);
        logger.info(`ObjectLayer created successfully with id: ${newObjectLayer._id}`);
        return newObjectLayer;
      } catch (error) {
        logger.error('Error creating ObjectLayer:', error);
        throw error;
      }
    }

    // create object layer from body
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    return await new ObjectLayer(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;

    // GET /frame-counts/:id - Get frame counts for each direction using numeric codes
    if (req.path.startsWith('/frame-counts/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id).select(ObjectLayerDto.select.getMetadata());
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
        frameDuration: objectLayer.data.render.frame_duration,
        frameCounts,
      };
    }

    // GET /render/:id - Get only render data for specific object layer
    if (req.path.startsWith('/render/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id).select(ObjectLayerDto.select.getRender());
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }
      return objectLayer;
    }

    // GET /metadata/:id - Get only metadata (no render frames/colors) for specific object layer
    if (req.path.startsWith('/metadata/')) {
      const objectLayer = await ObjectLayer.findById(req.params.id).select(ObjectLayerDto.select.getMetadata());
      if (!objectLayer) {
        throw new Error('ObjectLayer not found');
      }
      return objectLayer;
    }

    // GET / - Get paginated list of object layers
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      ObjectLayer.find(query) // { userId: req.auth.user._id }
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .select(ObjectLayerDto.select.get()),
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
      }).select(ObjectLayerDto.select.getMetadata());

      if (objectLayer && objectLayer.data.render.frame_duration) {
        frameDuration = objectLayer.data.render.frame_duration;
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

      const objectLayerData = {
        data: {
          render: {
            frame_duration: req.body.data.render.frame_duration,
            is_stateless: req.body.data.render.is_stateless,
            frames: {},
            colors: [],
          },
          item: req.body.data.item,
          stats: req.body.data.stats,
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
          await ObjectLayerEngine.processAndPushFrame(objectLayerData.data.render, framePath, directionCode);
        }
      }

      // Generate SHA256 hash
      objectLayerData.sha256 = crypto.createHash('sha256').update(JSON.stringify(objectLayerData.data)).digest('hex');

      // Update MongoDB
      try {
        const updatedObjectLayer = await ObjectLayer.findByIdAndUpdate(objectLayerId, objectLayerData, { new: true });
        if (!updatedObjectLayer) {
          throw new Error('ObjectLayer not found for update');
        }
        logger.info(`ObjectLayer updated successfully with id: ${objectLayerId}`);
        return updatedObjectLayer;
      } catch (error) {
        logger.error('Error updating ObjectLayer:', error);
        throw error;
      }
    }

    // PUT /:id - Standard update
    return await ObjectLayer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  },
  delete: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    if (req.params.id) return await ObjectLayer.findByIdAndDelete(req.params.id);
    else return await ObjectLayer.deleteMany();
  },
};

export { ObjectLayerService };
