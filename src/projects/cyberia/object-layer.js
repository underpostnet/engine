/**
 * Provides utilities and engine logic for processing and managing Cyberia Online's object layer assets (skins, floors, weapons, etc.).
 * Shared logic consumed by both the Cyberia CLI and the REST API service layer.
 * @module src/projects/cyberia/object-layer.js
 * @namespace CyberiaObjectLayer
 */

import fs from 'fs-extra';
import path from 'path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { Jimp, intToRGBA, rgbaToInt } from 'jimp';
import { isObjectLayerAuthority, pinCanonical } from '../../api/object-layer/object-layer.publication.js';
import { parseIdentityJson } from '../../api/object-layer/object-layer.identity.js';
import { AtlasSpriteSheetStore } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { findBoundDefinition, writeItemDefinition } from './object-layer-catalog.js';
import { range } from '../../client/components/core/CommonJs.js';
import {
  getKeyframeDirectionsByCode,
  OBJECT_LAYER_DIRECTION_NAME_TO_CODE,
} from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { resolveObjectLayer } from '../../server/domain/object-layer-resolver.js';

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
 * @property {Object} [data.render] - Canonical render contract of the definition.
 * @property {string} [data.render.cid] - Canonical render CID: the primary render PNG.
 * @property {string} [data.render.metadataCid] - Canonical metadata CID: the canonical bytes of the primary render's metadata.
 * @property {ObjectLayerRenderFramesData} [objectLayerRenderFramesData] - Render frames data (transient, used before persisting).
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} BuildFromDirectoryResult
 * @property {ObjectLayerRenderFramesData} objectLayerRenderFramesData - The assembled render frames data.
 * @property {Object} objectLayerData - The assembled object layer data (without render frames reference).
 * @memberof CyberiaObjectLayer
 */

/**
 * @typedef {Object} PersistDocumentsOptions
 * @property {boolean} [generateAtlas=true] - Whether to generate the atlas sprite sheet.
 * @property {number} [upscaleFactor] - Pixels per cell of the upscaled render.
 * @property {Object} [options] - Router options ({ host, path }) for model lookup.
 * @memberof CyberiaObjectLayer
 */

/**
 * Engine class providing static utilities for Cyberia Online object layer asset processing,
 * frame extraction, directory iteration, image building, and document creation logic.
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
    const keyframeDirections = getKeyframeDirectionsByCode(directionCode);

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

  // ──────────────────────────────────────────────────────────────────────────
  // Document lifecycle methods
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
  static objectLayerDataFactory({ metadata, objectLayerType, objectLayerId }) {
    const { validateStats, generateRandomStats } = CyberiaObjectLayerProfile;
    const item = { id: objectLayerId, type: objectLayerType, description: '', activable: true };
    if (!metadata?.data) return { data: { item, stats: generateRandomStats() } };
    return {
      data: {
        item: metadata.data.item || item,
        stats: validateStats(metadata.data.stats ?? generateRandomStats()),
      },
    };
  }

  static async buildObjectLayerDataFromDirectory({ folder, objectLayerType, objectLayerId, metadataOverride = null }) {
    let metadata = metadataOverride;

    // If no override was supplied, try to read metadata.json from the folder
    if (!metadata) {
      const metadataPath = `${folder}/metadata.json`;
      if (fs.existsSync(metadataPath)) {
        metadata = parseIdentityJson(fs.readFileSync(metadataPath, 'utf8'));
      }
    }

    // Build objectLayerRenderFramesData
    let objectLayerRenderFramesData;
    if (metadata && metadata.objectLayerRenderFramesData) {
      // The editor states each frame cell for cell, with its own width and height. The PNGs
      // beside it are what the client serves, not a source to re-derive the cells from: a
      // decode has to guess the cell size, and a guess resamples every frame it is wrong for.
      const { frames, colors, frame_duration } = metadata.objectLayerRenderFramesData;
      const authored = frames && colors && Object.values(frames).some((direction) => direction?.length > 0);
      objectLayerRenderFramesData = {
        frame_duration: frame_duration || 250,
        frames: authored ? frames : {},
        colors: authored ? colors : [],
      };
      if (authored)
        return {
          objectLayerRenderFramesData,
          objectLayerData: ObjectLayerEngine.objectLayerDataFactory({ metadata, objectLayerType, objectLayerId }),
        };
    } else if (metadata && metadata.data && metadata.data.render) {
      objectLayerRenderFramesData = {
        frame_duration: metadata.data.render.frame_duration || 250,
        frames: {},
        colors: [],
      };
    } else {
      objectLayerRenderFramesData = {
        frame_duration: 250,
        frames: {},
        colors: [],
      };
    }

    const objectLayerData = ObjectLayerEngine.objectLayerDataFactory({ metadata, objectLayerType, objectLayerId });

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
   * Writes frame PNGs and an optional metadata.json to one or more base asset
   * directories.  This is the shared write-to-disk step consumed by both the
   * Cyberia CLI `--generate` / `--import` flows and the REST API service
   * `post` / `put` `/metadata` endpoints.
   *
   * For each base path the layout produced is:
   * ```
   * {basePath}/assets/{itemType}/{itemId}/{directionCode}/{frameIndex}.png
   * {basePath}/assets/{itemType}/{itemId}/metadata.json          (optional)
   * ```
   *
   * @static
   * @param {Object} params
   * @param {string[]} params.basePaths - One or more root paths
   *   (e.g. `['./src/client/public/cyberia/', './public/host/path/']`).
   *   The conventional `assets/` prefix is appended automatically.
   * @param {string} params.itemType - Object layer type ('floor', 'skin', …).
   * @param {string} params.itemId   - Unique item identifier.
   * @param {ObjectLayerRenderFramesData} params.objectLayerRenderFramesData
   *   - The render frames data containing `frames`, `colors`,
   *     and `frame_duration`.
   * @param {Object} [params.objectLayerData=null] - When provided, a
   *   `metadata.json` file is written alongside the frame PNGs.
   * @param {number} [params.cellPixelDim=20] - Pixel size per grid cell.
   * @returns {Promise<string[]>} Flat list of every file path written.
   * @memberof CyberiaObjectLayer
   */
  static async writeStaticFrameAssets({
    basePaths,
    itemType,
    itemId,
    objectLayerRenderFramesData,
    objectLayerData = null,
    cellPixelDim = 20,
  }) {
    const writtenPaths = [];
    const dirToCode = OBJECT_LAYER_DIRECTION_NAME_TO_CODE;

    for (const basePath of basePaths) {
      // Track which directionCode/frameIndex combos we already wrote for
      // this basePath so duplicate direction names (e.g. down_idle,
      // none_idle, default_idle all map to '08') only write once.
      const written = new Set();

      for (const [dirName, dirFrames] of Object.entries(objectLayerRenderFramesData.frames)) {
        const code = dirToCode[dirName];
        if (!code) continue;

        for (let fi = 0; fi < dirFrames.length; fi++) {
          const key = `${code}/${fi}`;
          if (written.has(key)) continue;
          written.add(key);

          const dirFolder = path.join(basePath, 'assets', itemType, itemId, code);
          await fs.ensureDir(dirFolder);

          const filePath = path.join(dirFolder, `${fi}.png`);

          await ObjectLayerEngine.buildImgFromTile({
            tile: {
              map_color: objectLayerRenderFramesData.colors,
              frame_matrix: dirFrames[fi],
            },
            cellPixelDim,
            opacityFilter: (x, y, color) => 255,
            imagePath: filePath,
          });

          writtenPaths.push(filePath);
        }
      }

      // Write metadata.json when objectLayerData is supplied
      if (objectLayerData) {
        const metaDir = path.join(basePath, 'assets', itemType, itemId);
        await fs.ensureDir(metaDir);
        const metadataPath = path.join(metaDir, 'metadata.json');

        await fs.writeJson(
          metadataPath,
          {
            data: objectLayerData.data,
            objectLayerRenderFramesData: {
              frame_duration: objectLayerRenderFramesData.frame_duration,
            },
            generated: true,
            generatorVersion: '1.0.0',
          },
          { spaces: 2 },
        );
        writtenPaths.push(metadataPath);
      }
    }

    return writtenPaths;
  }

  /**
   * Writes the definition of a Cyberia item from its render frames: builds the render, publishes
   * the definition that names it, and stores the render frames and the atlas under its cid.
   * Changed content becomes a new definition bound to the label; identical content keeps the
   * bound one and takes the new materializations.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {import('./object-layer-catalog.js').CatalogModels} params.models - ObjectLayer and CyberiaItemCatalog models.
   * @param {ObjectLayerRenderFramesData} params.objectLayerRenderFramesData - Render frames payload.
   * @param {Object} params.objectLayerData - Object layer payload (must include `data`).
   * @param {PersistDocumentsOptions} [params.persistOptions={}] - Atlas generation and IPFS options.
   * @returns {Promise<Object>} The bound definition.
   * @memberof CyberiaObjectLayer
   */
  static async persistObjectLayerDocuments({
    models,
    objectLayerRenderFramesData,
    objectLayerData,
    persistOptions = {},
  }) {
    const { generateAtlas = true, upscaleFactor, options } = persistOptions;
    const itemId = objectLayerData.data.item.id;

    let rendered;
    if (generateAtlas) {
      try {
        rendered = await AtlasSpriteSheetStore.build({
          itemKey: itemId,
          objectLayerRenderFrames: objectLayerRenderFramesData,
          upscaleFactor,
          options,
        });
      } catch (atlasError) {
        logger.error(`Failed to generate atlas for "${itemId}":`, atlasError);
      }
    }

    const objectLayer = await ObjectLayerEngine.publishItemDefinition({
      models,
      payload: objectLayerData,
      renderFrames: objectLayerRenderFramesData,
      rendered,
      options,
    });
    logger.info(`ObjectLayer for item "${itemId}" published with id: ${objectLayer._id} (cid: ${objectLayer.cid})`);
    return objectLayer;
  }

  /**
   * Publishes a definition for a Cyberia item label through the Object Layer authority.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {import('./object-layer-catalog.js').CatalogModels} params.models - ObjectLayer and CyberiaItemCatalog models.
   * @param {Object} params.payload - `{ data, createdBy?, _id? }`.
   * @param {Object} [params.renderFrames] - Editor source of the definition.
   * @param {{render: Object, atlas: Object}} [params.rendered] - Render built for it.
   * @param {Object} [params.options] - Router options ({ host, path }).
   * @returns {Promise<Object>} The bound document.
   * @memberof CyberiaObjectLayer
   */
  static async publishItemDefinition({ models, payload, renderFrames, rendered, options }) {
    return await writeItemDefinition({ models, payload, renderFrames, rendered, options });
  }

  /**
   * The payload of a definition with its content changed in memory, ready to publish as a new
   * definition.
   * @static
   * @param {Object} objectLayer - A mongoose ObjectLayer document.
   * @returns {{data:Object}}
   * @memberof CyberiaObjectLayer
   */
  static payloadOf(objectLayer) {
    return { data: objectLayer.toObject({ virtuals: false }).data };
  }

  /**
   * Resolves the identity of the definition bound to a Cyberia item label, and pins it so the
   * CID resolves through a gateway.
   *
   * @static
   * @param {Object} params
   * @param {string} params.itemId - Cyberia item label.
   * @param {import('./object-layer-catalog.js').CatalogModels} params.models - ObjectLayer and CyberiaItemCatalog models.
   * @param {Object} [params.options] - `{ host, path }` forwarded to pin helpers.
   * @returns {Promise<{ cid: string, contentHash: string, objectLayerId: string, pinned: boolean }>}
   * @memberof CyberiaObjectLayer
   */
  static async resolveItemIdentity({ itemId, models, options }) {
    const objectLayer = await findBoundDefinition(models, itemId);
    if (!objectLayer) throw new Error(`Item "${itemId}" is not bound to an Object Layer definition`);
    // Pinning is the authority's part of publication; a consumer reads what it recorded.
    const pinned = isObjectLayerAuthority(options)
      ? await pinCanonical({ ObjectLayer: models.ObjectLayer, definition: objectLayer, options })
      : Boolean((await resolveObjectLayer(objectLayer.cid, options))?.published);
    if (!pinned) logger.warn(`Canonical bytes of "${itemId}" are not pinned; ${objectLayer.cid} will not resolve via gateway`);
    return { cid: objectLayer.cid, contentHash: objectLayer.contentHash, objectLayerId: String(objectLayer._id), pinned };
  }

  /**
   * Tells whether an `ol` invocation asks for the render rebuild.
   *
   * `--to-atlas-sprite-sheet` always asks for it. `--upscale` sets the factor of the
   * upscaled derived render and nothing else, so on its own it asks for the same
   * rebuild; next to another action it only sets that action's factor.
   *
   * @static
   * @param {Object} [options={}] - Parsed `ol` command options.
   * @returns {boolean} True when the render has to be rebuilt.
   * @memberof CyberiaObjectLayer
   */
  static selectAtlasRebuild(options = {}) {
    const namedAnAction = Boolean(
      options.import ||
        options.syncDerived ||
        options.importTypes ||
        options.drop ||
        options.generate ||
        options.showAtlasSpriteSheet ||
        options.showFrame !== undefined,
    );
    return options.toAtlasSpriteSheet !== undefined || (options.upscale !== undefined && !namedAnAction);
  }

  /**
   * Selects the item ids an `ol` action works on, such as `--sync-derived` or
   * `--to-atlas-sprite-sheet`.
   *
   * With no requested ids, every stored item id is taken. With requested ids,
   * only the ids the collection holds are kept, so an action stays limited to
   * documents that already exist.
   *
   * @static
   * @param {Object} params
   * @param {string[]} params.storedItemIds - Item ids of the ObjectLayer collection, or of one instance.
   * @param {string[]} [params.requestedItemIds=[]] - Item ids given on the command line.
   * @returns {{ itemIds: string[], missingItemIds: string[] }}
   * @memberof CyberiaObjectLayer
   */
  static selectStoredItemIds({ storedItemIds, requestedItemIds = [] }) {
    const normalize = (ids) =>
      [...new Set((ids ?? []).filter((id) => typeof id === 'string').map((id) => id.trim()))].filter(Boolean);
    const stored = normalize(storedItemIds);
    const requested = normalize(requestedItemIds);
    if (requested.length === 0) return { itemIds: stored, missingItemIds: [] };
    const storedSet = new Set(stored);
    return {
      itemIds: requested.filter((id) => storedSet.has(id)),
      missingItemIds: requested.filter((id) => !storedSet.has(id)),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Named exports of the ObjectLayerEngine statics the Cyberia CLI imports.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @see {@link ObjectLayerEngine.pngDirectoryIteratorByObjectLayerType}
 * @function pngDirectoryIteratorByObjectLayerType
 * @memberof CyberiaObjectLayer
 */
export const pngDirectoryIteratorByObjectLayerType = ObjectLayerEngine.pngDirectoryIteratorByObjectLayerType;

/**
 * @see {@link ObjectLayerEngine.buildImgFromTile}
 * @function buildImgFromTile
 * @memberof CyberiaObjectLayer
 */
export const buildImgFromTile = ObjectLayerEngine.buildImgFromTile;

/**
 * @see {@link ObjectLayerEngine.resolveItemIdentity}
 * @function resolveItemIdentity
 * @memberof CyberiaObjectLayer
 */
export const resolveItemIdentity = ObjectLayerEngine.resolveItemIdentity;
