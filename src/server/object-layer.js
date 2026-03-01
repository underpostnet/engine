/**
 * Provides utilities and engine logic for processing and managing Cyberia Online's object layer assets (skins, floors, weapons, etc.).
 * Centralizes shared logic consumed by both the Cyberia CLI and the REST API service layer.
 * @module src/server/object-layer.js
 * @namespace CyberiaObjectLayer
 */

import fs from 'fs-extra';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { Jimp, intToRGBA, rgbaToInt } from 'jimp';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

import { range } from '../client/components/core/CommonJs.js';
import { random } from '../client/components/core/CommonJs.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @typedef {Object} ObjectLayerCallbackPayload
 * @property {string} path - The full file path to the image.
 * @property {string} objectLayerType - The type of object layer (e.g., 'skin', 'floor').
 * @property {string} objectLayerId - The unique ID of the object layer asset.
 * @property {string} direction - The direction folder name (e.g., '08', '12').
 * @property {string} frame - The frame file name.
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} ObjectLayerRenderFramesData
 * @property {Object<string, number[][][]>} frames - Map of direction names to arrays of frame matrices.
 * @property {Array<number[]>} colors - Global color palette shared across all frames.
 * @property {number} frame_duration - Duration of each frame in milliseconds.
 * @property {boolean} is_stateless - Whether the render layer is stateless (no animation state).
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} ObjectLayerData
 * @property {Object} data - Object layer data payload.
 * @property {Object} data.item - Item descriptor.
 * @property {string} data.item.id - Unique identifier for the item.
 * @property {string} data.item.type - Type of the item (e.g., 'skin', 'floor').
 * @property {string} [data.item.description] - Human-readable description.
 * @property {boolean} [data.item.activable] - Whether the item can be activated.
 * @property {Object} data.stats - Statistical attributes of the object layer.
 * @property {string} data.seed - Random UUID v4 for unique state generation.
 * @property {string} [data.atlasSpriteSheetCid] - IPFS CID for the consolidated atlas sprite sheet PNG.
 * @property {ObjectLayerRenderFramesData} [objectLayerRenderFramesData] - Render frames data (transient, used before persisting).
 * @property {import('mongoose').Types.ObjectId} [objectLayerRenderFramesId] - Reference to persisted ObjectLayerRenderFrames document.
 * @property {string} [sha256] - SHA-256 hash of the object layer data.
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} BuildFromDirectoryResult
 * @property {ObjectLayerRenderFramesData} objectLayerRenderFramesData - The assembled render frames data.
 * @property {Object} objectLayerData - The assembled object layer data (without render frames reference or sha256).
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} CreateDocumentsOptions
 * @property {boolean} [generateAtlas=true] - Whether to generate the atlas sprite sheet after creating documents.
 * @property {Object} [atlasServiceContext] - Context required by AtlasSpriteSheetService.generate (req, res, options).
 * @property {Object} [atlasServiceContext.req] - Express-like request object (must include auth).
 * @property {Object} [atlasServiceContext.res] - Express-like response object.
 * @property {Object} [atlasServiceContext.options] - Server options (host, path).
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} CreateDocumentsResult
 * @property {Object} objectLayer - The persisted ObjectLayer mongoose document.
 * @property {Object} objectLayerRenderFramesDoc - The persisted ObjectLayerRenderFrames mongoose document.
 * @memberof CyberiaObjectLayer
 */

/**
 * Engine class providing static utilities for Cyberia Online object layer asset processing,
 * frame extraction, directory iteration, image building, and centralized document creation logic.
 * @class ObjectLayerEngine
 * @memberof CyberiaObjectLayer
 */
export class ObjectLayerEngine {
  /**
   * Iterates through the directory structure of object layer PNG assets for a given type.
   * Walks `./src/client/public/cyberia/assets/{objectLayerType}/{id}/{direction}/{frame}`.
   * @static
   * @param {string} [objectLayerType='skin'] - The type of object layer to iterate over (e.g., 'skin', 'floor').
   * @param {function(ObjectLayerCallbackPayload): Promise<void>} [callback=() => {}] - The async function to execute for each image file found.
   * @returns {Promise<void>}
   * @memberof CyberiaObjectLayer
   */
  static async pngDirectoryIteratorByObjectLayerType(
    objectLayerType = 'skin',
    callback = ({ path, objectLayerType, objectLayerId, direction, frame }) => {},
  ) {
    const assetRoot = `./src/client/public/cyberia/assets/${objectLayerType}`;
    if (!fs.existsSync(assetRoot)) {
      logger.warn(`Asset root not found for type: ${objectLayerType}`);
      return;
    }

    for (const objectLayerId of await fs.readdir(assetRoot)) {
      const idPath = `${assetRoot}/${objectLayerId}`;
      if (!fs.statSync(idPath).isDirectory()) continue;

      for (const direction of await fs.readdir(idPath)) {
        const dirFolder = `${idPath}/${direction}`;
        if (!fs.statSync(dirFolder).isDirectory()) continue;

        for (const frame of await fs.readdir(dirFolder)) {
          const imageFilePath = `${dirFolder}/${frame}`;
          await callback({ path: imageFilePath, objectLayerType, objectLayerId, direction, frame });
        }
      }
    }
  }

  /**
   * Asynchronously reads a PNG file and resolves with its raw bitmap data, width, and height.
   * @static
   * @param {string} filePath - The path to the PNG file.
   * @returns {Promise<{width: number, height: number, data: Buffer} | {error: true, message: string}>} The image data or an error object.
   * @memberof CyberiaObjectLayer
   */
  static readPngAsync(filePath) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(new PNG())
        .on('parsed', function () {
          resolve({
            width: this.width,
            height: this.height,
            data: Buffer.from(this.data),
          });
        })
        .on('error', (error) => {
          logger.error(`Error reading PNG file: ${filePath}`, error);
          // Resolve with a specific error indicator instead of rejecting
          resolve({ error: true, message: error.message });
        });
    });
  }

  /**
   * Processes an image file (PNG or GIF) to generate a frame matrix and a color palette (map_color).
   * It quantizes the image based on a factor derived from image height (mazeFactor).
   * @static
   * @param {string} path - The path to the image file.
   * @param {Array<number[]>} [colors=[]] - The existing color palette array to append new colors to.
   * @returns {Promise<{frame: number[][], colors: Array<number[]>}>} The frame matrix and the updated color palette.
   * @memberof CyberiaObjectLayer
   */
  static async frameFactory(path, colors = []) {
    const frame = [];
    try {
      let image;

      if (path.endsWith('.gif')) {
        image = await Jimp.read(path);
        // remove gif file
        fs.removeSync(path);
        // save image replacing gif for png
        const pngPath = path.replace('.gif', '.png');
        await image.write(pngPath);
      } else {
        const png = await ObjectLayerEngine.readPngAsync(path);
        if (png.error) {
          throw new Error(`Failed to read PNG: ${png.message}`);
        }
        image = new Jimp(png);
      }

      const cellSize = parseInt(image.bitmap.height / 24);
      let matrixY = -1;
      for (const y of range(0, image.bitmap.height - 1)) {
        if (y % cellSize === 0) {
          matrixY++;
          if (!frame[matrixY]) frame[matrixY] = [];
        }
        let matrixX = -1;
        for (const x of range(0, image.bitmap.width - 1)) {
          const rgba = Object.values(intToRGBA(image.getPixelColor(x, y)));
          if (y % cellSize === 0 && x % cellSize === 0) {
            matrixX++;
            const colorIndex = colors.findIndex(
              (c) => c[0] === rgba[0] && c[1] === rgba[1] && c[2] === rgba[2] && c[3] === rgba[3],
            );
            if (colorIndex === -1) {
              colors.push(rgba);
              frame[matrixY][matrixX] = colors.length - 1;
            } else {
              frame[matrixY][matrixX] = colorIndex;
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to process image ${path}:`, error);
    }
    return { frame, colors };
  }

  /**
   * Converts a numerical folder direction (e.g., '08', '14') into an array of corresponding keyframe names (e.g., 'down_idle', 'left_walking').
   * @static
   * @param {string} direction - The numerical direction string.
   * @returns {string[]} An array of keyframe direction names.
   * @memberof CyberiaObjectLayer
   */
  static getKeyFramesDirectionsFromNumberFolderDirection(direction) {
    let objectLayerFrameDirections = [];

    switch (direction) {
      case '08':
        objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
        break;
      case '18':
        objectLayerFrameDirections = ['down_walking'];
        break;
      case '02':
        objectLayerFrameDirections = ['up_idle'];
        break;
      case '12':
        objectLayerFrameDirections = ['up_walking'];
        break;
      case '04':
        objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
        break;
      case '14':
        objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
        break;
      case '06':
        objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
        break;
      case '16':
        objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
        break;
    }

    return objectLayerFrameDirections;
  }

  /**
   * Processes an image file through {@link ObjectLayerEngine.frameFactory} and adds the resulting frame to the render data structure.
   * Updates the color palette and pushes the frame to all keyframe directions corresponding to the given direction code.
   * Initializes colors array, frames object, and direction arrays if they don't exist.
   * @static
   * @param {ObjectLayerRenderFramesData} objectLayerRenderFramesData - The render data object containing frames and colors.
   * @param {string} imagePath - The path to the image file to process.
   * @param {string} directionCode - The numerical direction code (e.g., '08', '14').
   * @returns {Promise<ObjectLayerRenderFramesData>} The updated render data object.
   * @memberof CyberiaObjectLayer
   */
  static async processAndPushFrame(objectLayerRenderFramesData, imagePath, directionCode) {
    // Initialize colors array if it doesn't exist
    if (!objectLayerRenderFramesData.colors) {
      objectLayerRenderFramesData.colors = [];
    }

    // Initialize frames object if it doesn't exist
    if (!objectLayerRenderFramesData.frames) {
      objectLayerRenderFramesData.frames = {};
    }

    // Process the image and extract frame matrix and updated colors
    const processedObjectLayerRenderFramesData = await ObjectLayerEngine.frameFactory(
      imagePath,
      objectLayerRenderFramesData.colors,
    );

    // Update the colors palette
    objectLayerRenderFramesData.colors = processedObjectLayerRenderFramesData.colors;

    // Get all keyframe directions for this direction code
    const keyframeDirections = ObjectLayerEngine.getKeyFramesDirectionsFromNumberFolderDirection(directionCode);

    // Push the frame to all corresponding directions
    for (const keyframeDirection of keyframeDirections) {
      if (!objectLayerRenderFramesData.frames[keyframeDirection]) {
        objectLayerRenderFramesData.frames[keyframeDirection] = [];
      }
      objectLayerRenderFramesData.frames[keyframeDirection].push(processedObjectLayerRenderFramesData.frame);
    }

    return objectLayerRenderFramesData;
  }

  /**
   * Builds a PNG image file from a tile matrix and color map using Jimp and Sharp.
   * @static
   * @param {Object} options - Options object.
   * @param {Object} options.tile - The tile data.
   * @param {Array<number[]>} options.tile.map_color - The color palette.
   * @param {number[][]} options.tile.frame_matrix - The matrix of color indices.
   * @param {string} options.imagePath - The output path for the generated image.
   * @param {number} [options.cellPixelDim=20] - The pixel dimension of each cell in the matrix.
   * @param {function(number, number, number[]): number} [options.opacityFilter] - Function to filter opacity (ignored in this implementation).
   * @returns {Promise<void>}
   * @memberof CyberiaObjectLayer
   */
  static async buildImgFromTile(
    options = {
      tile: { map_color: null, frame_matrix: null },
      imagePath: '',
      cellPixelDim: 20,
      opacityFilter: (x, y, color) => 255,
    },
  ) {
    const { tile, imagePath, cellPixelDim } = options;
    const frameMatrix = tile.frame_matrix;
    if (!frameMatrix || frameMatrix.length === 0 || frameMatrix[0].length === 0) {
      logger.error(`Cannot build image from empty or invalid frame_matrix for path: ${imagePath}`);
      return;
    }

    const sharpOptions = {
      create: {
        width: cellPixelDim * frameMatrix[0].length,
        height: cellPixelDim * frameMatrix.length,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
      },
    };

    let image = await sharp(sharpOptions).png().toBuffer();
    fs.writeFileSync(imagePath, image);
    image = await Jimp.read(imagePath);

    for (let y = 0; y < frameMatrix.length; y++) {
      for (let x = 0; x < frameMatrix[y].length; x++) {
        const colorIndex = frameMatrix[y][x];
        if (colorIndex === null || colorIndex === undefined) continue;

        const color = tile.map_color[colorIndex];
        if (!color) continue;

        const rgbaColor = color.length === 4 ? color : [...color, 255]; // Ensure alpha channel

        for (let dy = 0; dy < cellPixelDim; dy++) {
          for (let dx = 0; dx < cellPixelDim; dx++) {
            const pixelX = x * cellPixelDim + dx;
            const pixelY = y * cellPixelDim + dy;
            image.setPixelColor(rgbaToInt(...rgbaColor), pixelX, pixelY);
          }
        }
      }
    }

    await image.write(imagePath);
  }

  /**
   * Generates a random set of character statistics for an item, with values between 0 and 10.
   * @static
   * @returns {{effect: number, resistance: number, agility: number, range: number, intelligence: number, utility: number}} The random stats object.
   * @memberof CyberiaObjectLayer
   */
  static generateRandomStats() {
    return {
      effect: random(0, 10),
      resistance: random(0, 10),
      agility: random(0, 10),
      range: random(0, 10),
      intelligence: random(0, 10),
      utility: random(0, 10),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Centralized document lifecycle methods
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scans a local asset directory for PNG frame images and assembles both
   * {@link ObjectLayerRenderFramesData} and {@link ObjectLayerData} from the directory contents
   * and an optional `metadata.json` file.
   *
   * This is the shared first step consumed by both the Cyberia CLI `--import` flow
   * and the REST API service `post` / `put` `/metadata` endpoints.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {string} params.folder - Absolute or relative path to the asset folder
   *   (e.g., `./src/client/public/cyberia/assets/skin/myskin`). Must contain numeric
   *   direction sub-folders (`08`, `18`, …) with PNG frame files.
   * @param {string} params.objectLayerType - The item type string (e.g., 'skin', 'floor').
   * @param {string} params.objectLayerId - The item id string.
   * @param {Object} [params.metadataOverride=null] - When provided, used as the authoritative
   *   metadata instead of reading `metadata.json` from disk.  The REST API passes `req.body`
   *   here; the CLI passes `null` so the file is read from disk.
   * @returns {Promise<BuildFromDirectoryResult>} The assembled render frames data and object layer data.
   * @memberof CyberiaObjectLayer
   */
  static async buildObjectLayerDataFromDirectory({ folder, objectLayerType, objectLayerId, metadataOverride = null }) {
    let metadata = metadataOverride;

    // If no override was supplied, try to read metadata.json from the folder
    if (!metadata) {
      const metadataPath = `${folder}/metadata.json`;
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      }
    }

    // Build objectLayerRenderFramesData
    let objectLayerRenderFramesData;
    if (metadata && metadata.objectLayerRenderFramesData) {
      objectLayerRenderFramesData = {
        frame_duration: metadata.objectLayerRenderFramesData.frame_duration || 250,
        is_stateless: metadata.objectLayerRenderFramesData.is_stateless || false,
        frames: {},
        colors: [],
      };
    } else if (metadata && metadata.data && metadata.data.render) {
      objectLayerRenderFramesData = {
        frame_duration: metadata.data.render.frame_duration || 250,
        is_stateless: metadata.data.render.is_stateless || false,
        frames: {},
        colors: [],
      };
    } else {
      objectLayerRenderFramesData = {
        frame_duration: 250,
        is_stateless: false,
        frames: {},
        colors: [],
      };
    }

    // Build objectLayerData
    let objectLayerData;
    if (metadata && metadata.data) {
      objectLayerData = {
        data: {
          item: metadata.data.item || {
            id: objectLayerId,
            type: objectLayerType,
            description: '',
            activable: true,
          },
          stats: metadata.data.stats || ObjectLayerEngine.generateRandomStats(),
          seed: metadata.data.seed || crypto.randomUUID(),
        },
      };
    } else {
      objectLayerData = {
        data: {
          item: {
            id: objectLayerId,
            type: objectLayerType,
            description: '',
            activable: true,
          },
          stats: ObjectLayerEngine.generateRandomStats(),
          seed: crypto.randomUUID(),
        },
      };
    }

    // Process all PNG files from direction sub-folders
    if (fs.existsSync(folder)) {
      const directionFolders = await fs.readdir(folder);
      for (const directionCode of directionFolders) {
        const directionPath = `${folder}/${directionCode}`;

        // Skip non-directories (metadata.json, etc.)
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
          await ObjectLayerEngine.processAndPushFrame(objectLayerRenderFramesData, framePath, directionCode);
        }
      }
    }

    return { objectLayerRenderFramesData, objectLayerData };
  }

  /**
   * Computes a SHA-256 hash of the given object layer data using deterministic JSON serialisation.
   * @static
   * @param {Object} data - The `data` sub-document of an ObjectLayer (item, stats, seed, atlasSpriteSheetCid, …).
   * @returns {string} Hex-encoded SHA-256 hash.
   * @memberof CyberiaObjectLayer
   */
  static computeSha256(data) {
    return crypto.createHash('sha256').update(stringify(data)).digest('hex');
  }

  /**
   * Creates new ObjectLayerRenderFrames and ObjectLayer documents in MongoDB from the
   * provided data, computes an initial SHA-256, and optionally generates the atlas sprite sheet.
   *
   * When `generateAtlas` is `true` (the default) the method delegates to
   * `AtlasSpriteSheetService.generate` and then recomputes the definitive SHA-256
   * (which now includes `data.atlasSpriteSheetCid`) and persists an IPFS CID.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {Object} params.ObjectLayer - Mongoose ObjectLayer model.
   * @param {Object} params.ObjectLayerRenderFrames - Mongoose ObjectLayerRenderFrames model.
   * @param {ObjectLayerRenderFramesData} params.objectLayerRenderFramesData - Render frames payload.
   * @param {Object} params.objectLayerData - Object layer payload (must include `data`).
   * @param {CreateDocumentsOptions} [params.createOptions={}] - Additional options controlling atlas generation and IPFS pinning.
   * @returns {Promise<CreateDocumentsResult>} The persisted documents.
   * @memberof CyberiaObjectLayer
   */
  static async createObjectLayerDocuments({
    ObjectLayer,
    ObjectLayerRenderFrames,
    objectLayerRenderFramesData,
    objectLayerData,
    createOptions = {},
  }) {
    const { generateAtlas = true, atlasServiceContext = null } = createOptions;

    // 1. Persist ObjectLayerRenderFrames
    const objectLayerRenderFramesDoc = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);

    // 2. Attach reference + compute temporary SHA-256
    objectLayerData.objectLayerRenderFramesId = objectLayerRenderFramesDoc._id;
    objectLayerData.data.atlasSpriteSheetCid = objectLayerData.data.atlasSpriteSheetCid || '';
    objectLayerData.sha256 = ObjectLayerEngine.computeSha256(objectLayerData.data);

    // 3. Upsert ObjectLayer (handle duplicate sha256 gracefully)
    let objectLayer;
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

    // 4. Optional atlas generation + final SHA-256 / IPFS CID
    if (generateAtlas && atlasServiceContext) {
      objectLayer = await ObjectLayerEngine._generateAtlasAndFinalize({
        objectLayer,
        ObjectLayer,
        atlasServiceContext,
        isNew: true,
      });
    }

    return { objectLayer, objectLayerRenderFramesDoc };
  }

  /**
   * Updates an existing ObjectLayer and its ObjectLayerRenderFrames from the provided data,
   * recomputes SHA-256, and optionally regenerates the atlas sprite sheet.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {string} params.objectLayerId - The `_id` of the ObjectLayer document to update.
   * @param {Object} params.ObjectLayer - Mongoose ObjectLayer model.
   * @param {Object} params.ObjectLayerRenderFrames - Mongoose ObjectLayerRenderFrames model.
   * @param {ObjectLayerRenderFramesData} params.objectLayerRenderFramesData - Render frames payload.
   * @param {Object} params.objectLayerData - Object layer payload (must include `data`).
   * @param {CreateDocumentsOptions} [params.updateOptions={}] - Additional options controlling atlas generation and IPFS pinning.
   * @returns {Promise<CreateDocumentsResult>} The persisted documents.
   * @memberof CyberiaObjectLayer
   */
  static async updateObjectLayerDocuments({
    objectLayerId,
    ObjectLayer,
    ObjectLayerRenderFrames,
    objectLayerRenderFramesData,
    objectLayerData,
    updateOptions = {},
  }) {
    const { generateAtlas = true, atlasServiceContext = null } = updateOptions;

    // 1. Update or create ObjectLayerRenderFrames
    let objectLayerRenderFramesDoc;
    const existingObjectLayer = await ObjectLayer.findById(objectLayerId);
    if (existingObjectLayer && existingObjectLayer.objectLayerRenderFramesId) {
      objectLayerRenderFramesDoc = await ObjectLayerRenderFrames.findByIdAndUpdate(
        existingObjectLayer.objectLayerRenderFramesId,
        objectLayerRenderFramesData,
        { new: true },
      );
      objectLayerData.objectLayerRenderFramesId = existingObjectLayer.objectLayerRenderFramesId;
    } else {
      objectLayerRenderFramesDoc = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);
      objectLayerData.objectLayerRenderFramesId = objectLayerRenderFramesDoc._id;
    }

    // 2. Compute temporary SHA-256
    objectLayerData.data.atlasSpriteSheetCid = objectLayerData.data.atlasSpriteSheetCid || '';
    objectLayerData.sha256 = ObjectLayerEngine.computeSha256(objectLayerData.data);

    // 3. Persist ObjectLayer update
    let objectLayer;
    try {
      objectLayer = await ObjectLayer.findByIdAndUpdate(objectLayerId, objectLayerData, {
        new: true,
      }).populate('objectLayerRenderFramesId');
      if (!objectLayer) {
        throw new Error('ObjectLayer not found for update');
      }
      logger.info(`ObjectLayer updated successfully with id: ${objectLayerId}`);
    } catch (error) {
      logger.error('Error updating ObjectLayer:', error);
      throw error;
    }

    // 4. Optional atlas generation + final SHA-256 / IPFS CID
    if (generateAtlas && atlasServiceContext) {
      objectLayer = await ObjectLayerEngine._generateAtlasAndFinalize({
        objectLayer,
        ObjectLayer,
        atlasServiceContext,
        isNew: false,
      });
    }

    return { objectLayer, objectLayerRenderFramesDoc };
  }

  /**
   * Recomputes the definitive SHA-256, pins the object layer data JSON to IPFS,
   * and persists both fields on the ObjectLayer document.
   *
   * Intended for use after atlas generation has set `data.atlasSpriteSheetCid`.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {Object} params.objectLayer - The mongoose ObjectLayer document (must be populated).
   * @param {Object} [params.ipfsClient=null] - The IpfsClient module; when `null`, IPFS pinning is skipped.
   * @param {function} [params.createPinRecord=null] - The `createPinRecord` helper; when `null`, pin records are skipped.
   * @param {string} [params.userId] - Authenticated user ID for IPFS pin record creation.
   * @param {Object} [params.options] - Server options (host, path) forwarded to `createPinRecord`.
   * @returns {Promise<Object>} The saved ObjectLayer document.
   * @memberof CyberiaObjectLayer
   */
  static async computeAndSaveFinalSha256({ objectLayer, ipfsClient = null, createPinRecord = null, userId, options }) {
    const finalSha256 = ObjectLayerEngine.computeSha256(objectLayer.data);

    if (ipfsClient) {
      try {
        const itemId = objectLayer.data.item.id;
        const ipfsResult = await ipfsClient.addJsonToIpfs(
          objectLayer.data,
          `${itemId}_data.json`,
          `/object-layer/${itemId}/${itemId}_data.json`,
        );
        if (ipfsResult) {
          objectLayer.cid = ipfsResult.cid;
          if (userId && createPinRecord) {
            await createPinRecord({ cid: ipfsResult.cid, userId, options });
          }
        }
      } catch (ipfsError) {
        logger.warn('Failed to add object layer data to IPFS:', ipfsError.message);
      }
    }

    objectLayer.sha256 = finalSha256;
    objectLayer.markModified('data');
    await objectLayer.save();

    return objectLayer;
  }

  /**
   * Internal helper that generates an atlas sprite sheet and then finalizes the SHA-256 / IPFS CID.
   * @static
   * @param {Object} params - Parameters.
   * @param {Object} params.objectLayer - The mongoose ObjectLayer document.
   * @param {Object} params.ObjectLayer - Mongoose ObjectLayer model (for re-reading).
   * @param {Object} params.atlasServiceContext - Context with `{ req, res, options, AtlasSpriteSheetService, IpfsClient, createPinRecord }`.
   * @param {boolean} params.isNew - Whether this is a newly created object layer (used for logging).
   * @returns {Promise<Object>} The finalized ObjectLayer document.
   * @memberof CyberiaObjectLayer
   * @private
   */
  static async _generateAtlasAndFinalize({ objectLayer, ObjectLayer, atlasServiceContext, isNew }) {
    const { req, res, options, AtlasSpriteSheetService, IpfsClient: ipfsClient, createPinRecord } = atlasServiceContext;

    // Generate atlas sprite sheet
    try {
      await AtlasSpriteSheetService.generate(
        { params: { id: objectLayer._id }, objectLayer, auth: req ? req.auth : undefined },
        res,
        options,
      );
    } catch (atlasError) {
      logger.error(`Failed to auto-${isNew ? 'generate' : 'update'} atlas for ObjectLayer:`, atlasError);
    }

    // Re-read the objectLayer so data.atlasSpriteSheetCid is up-to-date
    objectLayer = await ObjectLayer.findById(objectLayer._id).populate('objectLayerRenderFramesId');

    // Compute definitive SHA-256 and IPFS CID
    const userId = req && req.auth && req.auth.user ? req.auth.user._id : undefined;
    objectLayer = await ObjectLayerEngine.computeAndSaveFinalSha256({
      objectLayer,
      ipfsClient: ipfsClient || null,
      createPinRecord: createPinRecord || null,
      userId,
      options,
    });

    return objectLayer;
  }
}

/**
 * Mapping of item type names to numerical IDs.
 * @constant
 * @type {{floor: number, skin: number, weapon: number, skill: number, coin: number}}
 * @memberof CyberiaObjectLayer
 */
export const itemTypes = { floor: 0, skin: 1, weapon: 2, skill: 3, coin: 4 };

// ──────────────────────────────────────────────────────────────────────────
// Backward-compatible named exports matching the original destructured imports.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @see {@link ObjectLayerEngine.pngDirectoryIteratorByObjectLayerType}
 * @function pngDirectoryIteratorByObjectLayerType
 * @memberof CyberiaObjectLayer
 */
export const pngDirectoryIteratorByObjectLayerType = ObjectLayerEngine.pngDirectoryIteratorByObjectLayerType;

/**
 * @see {@link ObjectLayerEngine.readPngAsync}
 * @function readPngAsync
 * @memberof CyberiaObjectLayer
 */
export const readPngAsync = ObjectLayerEngine.readPngAsync;

/**
 * @see {@link ObjectLayerEngine.frameFactory}
 * @function frameFactory
 * @memberof CyberiaObjectLayer
 */
export const frameFactory = ObjectLayerEngine.frameFactory;

/**
 * @see {@link ObjectLayerEngine.getKeyFramesDirectionsFromNumberFolderDirection}
 * @function getKeyFramesDirectionsFromNumberFolderDirection
 * @memberof CyberiaObjectLayer
 */
export const getKeyFramesDirectionsFromNumberFolderDirection =
  ObjectLayerEngine.getKeyFramesDirectionsFromNumberFolderDirection;

/**
 * @see {@link ObjectLayerEngine.processAndPushFrame}
 * @function processAndPushFrame
 * @memberof CyberiaObjectLayer
 */
export const processAndPushFrame = ObjectLayerEngine.processAndPushFrame;

/**
 * @see {@link ObjectLayerEngine.buildImgFromTile}
 * @function buildImgFromTile
 * @memberof CyberiaObjectLayer
 */
export const buildImgFromTile = ObjectLayerEngine.buildImgFromTile;

/**
 * @see {@link ObjectLayerEngine.generateRandomStats}
 * @function generateRandomStats
 * @memberof CyberiaObjectLayer
 */
export const generateRandomStats = ObjectLayerEngine.generateRandomStats;

/**
 * @see {@link ObjectLayerEngine.buildObjectLayerDataFromDirectory}
 * @function buildObjectLayerDataFromDirectory
 * @memberof CyberiaObjectLayer
 */
export const buildObjectLayerDataFromDirectory = ObjectLayerEngine.buildObjectLayerDataFromDirectory;

/**
 * @see {@link ObjectLayerEngine.computeSha256}
 * @function computeSha256
 * @memberof CyberiaObjectLayer
 */
export const computeSha256 = ObjectLayerEngine.computeSha256;

/**
 * @see {@link ObjectLayerEngine.createObjectLayerDocuments}
 * @function createObjectLayerDocuments
 * @memberof CyberiaObjectLayer
 */
export const createObjectLayerDocuments = ObjectLayerEngine.createObjectLayerDocuments;

/**
 * @see {@link ObjectLayerEngine.updateObjectLayerDocuments}
 * @function updateObjectLayerDocuments
 * @memberof CyberiaObjectLayer
 */
export const updateObjectLayerDocuments = ObjectLayerEngine.updateObjectLayerDocuments;

/**
 * @see {@link ObjectLayerEngine.computeAndSaveFinalSha256}
 * @function computeAndSaveFinalSha256
 * @memberof CyberiaObjectLayer
 */
export const computeAndSaveFinalSha256 = ObjectLayerEngine.computeAndSaveFinalSha256;
