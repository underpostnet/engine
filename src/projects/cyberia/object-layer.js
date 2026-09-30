/**
 * Provides utilities and engine logic for processing and managing Cyberia Online's object layer assets (skins, floors, weapons, etc.).
 * Shared logic consumed by both the Cyberia CLI and the REST API service layer.
 * @module src/projects/cyberia/object-layer.js
 * @namespace CyberiaObjectLayer
 */

import fs from 'fs-extra';
import path from 'path';
import { PNG } from 'pngjs';
import { Jimp, intToRGBA } from 'jimp';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { isObjectLayerAuthority, pinCanonical } from '../../api/object-layer/object-layer.publication.js';
import { parseIdentityJson } from '../../api/object-layer/object-layer.identity.js';
import { AtlasSpriteSheetStore } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { AtlasSpriteSheetGenerator } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { findBoundDefinition, writeItemDefinition } from './object-layer-catalog.js';
import { range } from '../../client/components/core/CommonJs.js';
import {
  getKeyframeDirectionsByCode,
  OBJECT_LAYER_DIRECTION_NAME_TO_CODE,
} from '../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import {
  fromWire,
  isRenderSource,
  sourceFromIndexedFrames,
  toWire,
} from '../../client/components/objectlayer-studio/RenderSource.js';
import { CyberiaObjectLayerProfile } from '../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { resolveObjectLayer } from '../../server/domain/object-layer-resolver.js';

const logger = loggerFactory(import.meta);

/** Frame duration of a render decoded from images, which state none. */
const DEFAULT_FRAME_DURATION_MS = 250;

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
 * A render source (`RenderSource.js`): indexed frames, their palette and the frame duration.
 * @typedef {Object} ObjectLayerRenderFramesData
 * @memberof CyberiaObjectLayer
 */

/**
 * Frames decoded from images: index rows by keyframe, and the rgba colors the indexes name.
 * @typedef {{frames: Object<string, number[][][]>, colors: number[][]}} DecodedFrames
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
   * Decodes an image file through {@link ObjectLayerEngine.frameFactory} and adds the frame to
   * every keyframe of the direction code.
   * @static
   * @param {DecodedFrames} decoded - The frames decoded so far.
   * @param {string} imagePath - The path to the image file to process.
   * @param {string} directionCode - The numerical direction code (e.g., '08', '14').
   * @returns {Promise<DecodedFrames>} The frames with this one added.
   * @memberof CyberiaObjectLayer
   */
  static async processAndPushFrame(decoded, imagePath, directionCode) {
    const { frame, colors } = await ObjectLayerEngine.frameFactory(imagePath, decoded.colors);
    decoded.colors = colors;
    for (const keyframe of getKeyframeDirectionsByCode(directionCode)) (decoded.frames[keyframe] ??= []).push(frame);
    return decoded;
  }

  /**
   * Writes one frame of a render source as a PNG file.
   * @static
   * @param {Object} params
   * @param {ObjectLayerRenderFramesData} params.source - Render source.
   * @param {Uint8Array} params.pixels - The frame's palette indexes.
   * @param {string} params.imagePath - The output path.
   * @param {number} [params.cellPixelDim=20] - Pixels per cell.
   * @returns {Promise<void>}
   * @memberof CyberiaObjectLayer
   */
  static async writeFrameImage({ source, pixels, imagePath, cellPixelDim = 20 }) {
    await AtlasSpriteSheetGenerator.frameImage(source, pixels, cellPixelDim).write(imagePath);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Document lifecycle methods
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scans a local asset directory for PNG frame images and assembles both
   * {@link ObjectLayerRenderFramesData} and {@link ObjectLayerData} from the directory contents
   * and an optional `metadata.json` file.
   *
   * The asset-tree source of `cyberia ol --import --client-public` and `--import-types`.
   *
   * @static
   * @param {Object} params - Parameters.
   * @param {string} params.folder - Absolute or relative path to the asset folder
   *   (e.g., `./src/client/public/cyberia/assets/skin/myskin`). Must contain numeric
   *   direction sub-folders (`08`, `18`, …) with PNG frame files.
   * @param {string} params.objectLayerType - The item type string (e.g., 'skin', 'floor').
   * @param {string} params.objectLayerId - The item id string.
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

  static async buildObjectLayerDataFromDirectory({ folder, objectLayerType, objectLayerId }) {
    const metadataPath = `${folder}/metadata.json`;
    const metadata = fs.existsSync(metadataPath) ? parseIdentityJson(fs.readFileSync(metadataPath, 'utf8')) : null;

    const objectLayerData = ObjectLayerEngine.objectLayerDataFactory({ metadata, objectLayerType, objectLayerId });

    // The editor states each frame cell for cell. The PNGs beside it are what the client serves,
    // not a source to re-derive the cells from: a decode guesses the cell size.
    const authored = metadata?.objectLayerRenderFramesData;
    if (isRenderSource(authored) && Object.keys(authored.frames).length > 0)
      return { objectLayerRenderFramesData: fromWire(authored), objectLayerData };

    const decoded = { frames: {}, colors: [] };
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
          await ObjectLayerEngine.processAndPushFrame(decoded, framePath, directionCode);
        }
      }
    }

    return {
      objectLayerRenderFramesData: sourceFromIndexedFrames({ ...decoded, frameDurationMs: DEFAULT_FRAME_DURATION_MS }),
      objectLayerData,
    };
  }

  /**
   * The asset trees `cyberia ol --client-public` keeps: the source tree and the host's built tree.
   * @param {{host: string, path: string}} options
   * @returns {string[]}
   * @memberof CyberiaObjectLayer
   */
  static clientPublicPaths(options) {
    return ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`];
  }

  /**
   * Replaces the folder of an item in one or more asset trees with its frame PNGs and an optional
   * metadata.json: how `cyberia ol --client-public` keeps the asset tree consistent with each
   * operation.
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
   * @param {ObjectLayerRenderFramesData} params.objectLayerRenderFramesData - The render source.
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
      await fs.remove(path.join(basePath, 'assets', itemType, itemId));

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

          await ObjectLayerEngine.writeFrameImage({
            source: objectLayerRenderFramesData,
            pixels: dirFrames[fi],
            imagePath: filePath,
            cellPixelDim,
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
            objectLayerRenderFramesData: toWire(objectLayerRenderFramesData),
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
   * Builds the render of a definition again from its stored render frames and publishes the
   * definition that names it; the label rebinds to it. `revise` may change the payload first.
   *
   * @static
   * @param {Object} params
   * @param {import('./object-layer-catalog.js').CatalogModels} params.models
   * @param {Object} params.objectLayer - A mongoose ObjectLayer document.
   * @param {number} [params.upscaleFactor] - Pixels per cell of the upscaled render.
   * @param {number|null} [params.maxAtlasDim=null] - Atlas dimension cap.
   * @param {(payload:{data:Object})=>void} [params.revise] - Changes the payload in place.
   * @param {Object} [params.options] - Router options ({ host, path }).
   * @returns {Promise<{definition:Object,atlas:Object}|null>} Null when the definition has no render frames.
   * @memberof CyberiaObjectLayer
   */
  static async rebuildItemRender({
    models,
    objectLayer,
    upscaleFactor,
    maxAtlasDim = null,
    revise = () => {},
    options,
  }) {
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean();
    if (!stored) return null;
    const renderFrames = ObjectLayerRenderFrames.sourceOf(stored);
    const rendered = await AtlasSpriteSheetStore.build({
      itemKey: objectLayer.data.item.id,
      objectLayerRenderFrames: renderFrames,
      upscaleFactor,
      maxAtlasDim,
      options,
    });
    const payload = ObjectLayerEngine.payloadOf(objectLayer);
    revise(payload);
    const definition = await ObjectLayerEngine.publishItemDefinition({
      models,
      payload,
      renderFrames,
      rendered,
      options,
    });
    return { definition, atlas: rendered.atlas };
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
    if (!pinned)
      logger.warn(`Canonical bytes of "${itemId}" are not pinned; ${objectLayer.cid} will not resolve via gateway`);
    return {
      cid: objectLayer.cid,
      contentHash: objectLayer.contentHash,
      objectLayerId: String(objectLayer._id),
      pinned,
    };
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
      options.sync ||
      options.importTypes ||
      options.drop ||
      options.showAtlasSpriteSheet ||
      options.showFrame !== undefined,
    );
    return options.toAtlasSpriteSheet !== undefined || (options.upscale !== undefined && !namedAnAction);
  }

  /**
   * Selects the item ids an `ol` action works on, such as `--sync` or
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
export const writeFrameImage = ObjectLayerEngine.writeFrameImage;

/**
 * @see {@link ObjectLayerEngine.resolveItemIdentity}
 * @function resolveItemIdentity
 * @memberof CyberiaObjectLayer
 */
export const resolveItemIdentity = ObjectLayerEngine.resolveItemIdentity;
