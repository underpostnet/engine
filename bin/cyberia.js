#! /usr/bin/env node

/**
 * Cyberia Online CLI for object layer management.
 * Provides commands for importing, viewing, and managing object layer assets,
 * render frames, and atlas sprite sheets from the command line.
 *
 * Delegates shared object layer creation logic to {@link ObjectLayerEngine} in
 * `src/server/object-layer.js` to keep a single source of truth shared with
 * the REST API service layer.
 *
 * @module bin/cyberia.js
 * @namespace CyberiaCLI
 */

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import {
  ObjectLayerEngine,
  pngDirectoryIteratorByObjectLayerType,
  getKeyFramesDirectionsFromNumberFolderDirection,
  buildImgFromTile,
  itemTypes,
} from '../src/server/object-layer.js';
import { AtlasSpriteSheetGenerator } from '../src/server/atlas-sprite-sheet-generator.js';
import {
  generateFrame,
  generateMultiFrame,
  lookupSemantic,
  semanticRegistry,
} from '../src/server/semantic-layer-generator.js';
import { IpfsClient } from '../src/server/ipfs-client.js';
import { createPinRecord } from '../src/api/ipfs/ipfs.service.js';
import { program as underpostProgram } from '../src/cli/index.js';
import crypto from 'crypto';
import nodePath from 'path';
import Underpost from '../src/index.js';

/** @type {Function} */
const logger = loggerFactory(import.meta);

try {
  const program = new Command();

  /** @type {string} */
  const version = Underpost.version;

  program
    .name('cyberia')
    .description(
      `    cyberia online network object layer management ${version}
      https://www.cyberiaonline.com/object-layer-engine`,
    )
    .version(version);

  program
    .command('ol [item-id]')
    .option(
      '--to-atlas-sprite-sheet [dim]',
      'Convert object layers to atlas sprite sheets, specify dimension (default: auto-calculated based on frame count)',
    )
    .option('--show-atlas-sprite-sheet', 'Show consolidated atlas sprite sheet PNG for given item-id')
    .option('--import [object-layer-type]', 'Commas separated object layer types e.g. skin,floors')
    .option('--show-frame [direction-frame]', 'View object layer frame for given item-id e.g. 08_0 (default: 08_0)')
    .option('--generate', 'Generate procedural object layers from semantic item-id (e.g. floor-desert)')
    .option('--count <count>', 'Shape element count multiplier for --generate (default: 3)', parseFloat)
    .option('--seed <seed>', 'Deterministic seed string for --generate (e.g. fx-42)')
    .option('--frame-index <frameIndex>', 'Starting frame index for --generate (default: 0)', parseInt)
    .option('--frame-count <frameCount>', 'Number of frames to generate for --generate (default: 1)', parseInt)
    .option('--density <density>', 'Density factor 0..1 for --generate (default: 0.5)', parseFloat)
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--storage-file-path <storage-file-path>', 'Storage file path override')
    .option('--drop', 'Drop existing data before importing')
    .action(
      /**
       * Main action handler for the `ol` command.
       * Manages object layer import, frame viewing, atlas generation, and atlas display.
       *
       * @param {string|undefined} itemId - Optional item ID argument.
       * @param {Object} options - Command options parsed by Commander.
       * @param {boolean|string} options.import - Object layer types to import (e.g., 'all', 'skin,floor') or `false`.
       * @param {boolean|string} options.showFrame - Direction-frame string (e.g., '08_0') or `true` for default.
       * @param {string} options.envPath - Path to the `.env` file.
       * @param {string} options.mongoHost - MongoDB host override.
       * @param {string} options.storageFilePath - Path to a storage filter JSON file.
       * @param {boolean|string} options.toAtlasSpriteSheet - Atlas dimension or `true` for auto-calc.
       * @param {boolean} options.showAtlasSpriteSheet - Whether to display the atlas sprite sheet.
       * @param {boolean} options.drop - Whether to drop existing data before importing.
       * @param {boolean} options.generate - Whether to run procedural generation for the item-id.
       * @param {number} options.count - Shape element count multiplier for generation.
       * @param {string} options.seed - Deterministic seed string for generation.
       * @param {number} options.frameIndex - Starting frame index for generation.
       * @param {number} options.frameCount - Number of frames to generate.
       * @param {number} options.density - Density factor 0..1 for generation.
       * @returns {Promise<void>}
       * @memberof CyberiaCLI
       */
      async (
        itemId,
        options = {
          import: false,
          showFrame: '',
          envPath: '',
          mongoHost: '',
          storageFilePath: '',
          toAtlasSpriteSheet: '',
          showAtlasSpriteSheet: false,
          generate: false,
          count: 3,
          seed: '',
          frameIndex: 0,
          frameCount: 1,
          density: 0.5,
        },
      ) => {
        if (!options.envPath) options.envPath = `./.env`;
        if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

        /** @type {string} */
        const deployId = process.env.DEFAULT_DEPLOY_ID;
        /** @type {string} */
        const host = process.env.DEFAULT_DEPLOY_HOST;
        /** @type {string} */
        const path = process.env.DEFAULT_DEPLOY_PATH;

        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
        const { db } = confServer[host][path];

        db.host = options.mongoHost ? options.mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

        logger.info('env', {
          env: options.envPath,
          deployId,
          host,
          path,
          db,
        });

        await DataBaseProvider.load({
          apis: ['object-layer', 'object-layer-render-frames', 'atlas-sprite-sheet', 'file', 'ipfs'],
          host,
          path,
          db,
        });

        /** @type {import('mongoose').Model} */
        const ObjectLayer = DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayer;
        /** @type {import('mongoose').Model} */
        const ObjectLayerRenderFrames =
          DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayerRenderFrames;
        /** @type {import('mongoose').Model} */
        const AtlasSpriteSheet = DataBaseProvider.instance[`${host}${path}`].mongoose.models.AtlasSpriteSheet;
        /** @type {import('mongoose').Model} */
        const File = DataBaseProvider.instance[`${host}${path}`].mongoose.models.File;

        if (options.drop) {
          await ObjectLayer.deleteMany();
          await ObjectLayerRenderFrames.deleteMany();
          shellExec(`cd src/client/public/cyberia && underpost run clean .`);
        }

        /** @type {Object|null} */
        const storage = options.storageFilePath ? JSON.parse(fs.readFileSync(options.storageFilePath, 'utf8')) : null;

        // ── Handle --import ──────────────────────────────────────────────
        if (options.import) {
          /** @type {boolean} */
          const isImportAll = options.import === 'all';

          /** @type {string[]} */
          const argItemTypes = isImportAll ? Object.keys(itemTypes) : options.import.split(',');

          /**
           * Accumulated object layer data keyed by objectLayerId.
           * @type {Object<string, import('../src/server/object-layer.js').ObjectLayerData>}
           */
          const objectLayers = {};

          for (const argItemType of argItemTypes) {
            await pngDirectoryIteratorByObjectLayerType(
              argItemType,
              async ({ path: framePath, objectLayerType, objectLayerId, direction, frame }) => {
                if (
                  storage &&
                  !storage[`src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/08/0.png`]
                )
                  return;

                console.log(framePath, { objectLayerType, objectLayerId, direction, frame });

                // On first encounter of an objectLayerId, build its data from the asset directory
                if (!objectLayers[objectLayerId]) {
                  const folder = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}`;
                  const { objectLayerRenderFramesData, objectLayerData } =
                    await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
                      folder,
                      objectLayerType,
                      objectLayerId,
                    });

                  objectLayers[objectLayerId] = {
                    ...objectLayerData,
                    objectLayerRenderFramesData,
                    _processed: true,
                  };
                }
              },
            );
          }

          for (const objectLayerId of Object.keys(objectLayers)) {
            const entry = objectLayers[objectLayerId];

            // Skip atlas generation when importing all object layers at once (bulk import).
            // Individual imports or explicit --to-atlas-sprite-sheet calls will still generate atlases.
            const shouldGenerateAtlas = !isImportAll;

            if (shouldGenerateAtlas) {
              // Use the centralized createObjectLayerDocuments which handles atlas generation
              // Since we're in CLI context without a full Express req/res, we build a minimal
              // atlas generation flow using AtlasSpriteSheetGenerator directly after creation.
              const { objectLayer } = await ObjectLayerEngine.createObjectLayerDocuments({
                ObjectLayer,
                ObjectLayerRenderFrames,
                objectLayerRenderFramesData: entry.objectLayerRenderFramesData,
                objectLayerData: { data: entry.data },
                createOptions: {
                  generateAtlas: false,
                },
              });

              // Generate atlas sprite sheet for individual imports
              try {
                const itemKey = objectLayer.data.item.id;
                const populatedObjectLayer = await ObjectLayer.findById(objectLayer._id).populate(
                  'objectLayerRenderFramesId',
                );

                const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
                  populatedObjectLayer.objectLayerRenderFramesId,
                  itemKey,
                  20,
                );

                const fileDoc = await new File({
                  name: `${itemKey}-atlas.png`,
                  data: buffer,
                  size: buffer.length,
                  mimetype: 'image/png',
                  md5: crypto.createHash('md5').update(buffer).digest('hex'),
                }).save();

                let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });

                if (atlasDoc) {
                  atlasDoc.fileId = fileDoc._id;
                  atlasDoc.metadata = metadata;
                  await atlasDoc.save();
                  logger.info(`Updated existing AtlasSpriteSheet document: ${atlasDoc._id}`);
                } else {
                  atlasDoc = await new AtlasSpriteSheet({
                    fileId: fileDoc._id,
                    metadata,
                  }).save();
                  logger.info(`Created new AtlasSpriteSheet document: ${atlasDoc._id}`);
                }

                populatedObjectLayer.atlasSpriteSheetId = atlasDoc._id;
                await populatedObjectLayer.save();

                logger.info(`Atlas sprite sheet completed for item: ${itemKey}`);
              } catch (atlasError) {
                logger.error(`Failed to generate atlas for ${objectLayerId}:`, atlasError);
              }

              console.log(objectLayer);
            } else {
              // --import all: create documents without atlas generation
              const { objectLayer } = await ObjectLayerEngine.createObjectLayerDocuments({
                ObjectLayer,
                ObjectLayerRenderFrames,
                objectLayerRenderFramesData: entry.objectLayerRenderFramesData,
                objectLayerData: { data: entry.data },
                createOptions: {
                  generateAtlas: false,
                },
              });

              logger.info(`ObjectLayer created (atlas skipped for bulk import): ${objectLayerId}`);
              console.log(objectLayer);
            }
          }
        }

        // ── Handle --show-frame ──────────────────────────────────────────
        if (options.showFrame !== undefined) {
          if (!itemId) {
            logger.error('item-id is required for --show-frame');
            process.exit(1);
          }

          // Parse direction and frame (default: 08_0)
          /** @type {string} */
          const showFrameInput = options.showFrame === true ? '08_0' : options.showFrame;
          const [direction, frameIndex] = showFrameInput.split('_');
          /** @type {number} */
          const frameIndexNum = parseInt(frameIndex) || 0;

          logger.info(`Showing frame for item: ${itemId}, direction: ${direction}, frame: ${frameIndexNum}`);

          // Find ObjectLayer by item-id
          const objectLayer = await ObjectLayer.findOne({ 'data.item.id': itemId }).populate(
            'objectLayerRenderFramesId',
          );

          if (!objectLayer) {
            logger.error(`ObjectLayer not found for item-id: ${itemId}`);
            process.exit(1);
          }

          if (!objectLayer.objectLayerRenderFramesId) {
            logger.error(`ObjectLayerRenderFrames not found for item: ${itemId}`);
            process.exit(1);
          }

          // Get the keyframe direction name from the numerical direction code
          const objectLayerFrameDirections = getKeyFramesDirectionsFromNumberFolderDirection(direction);
          if (objectLayerFrameDirections.length === 0) {
            logger.error(`Invalid direction code: ${direction}. Valid codes: 08, 18, 02, 12, 04, 14, 06, 16`);
            process.exit(1);
          }

          const objectLayerFrameDirection = objectLayerFrameDirections[0];
          const frames = objectLayer.objectLayerRenderFramesId.frames[objectLayerFrameDirection];

          if (!frames || frames.length === 0) {
            logger.error(`No frames found for direction: ${objectLayerFrameDirection}`);
            process.exit(1);
          }

          if (frameIndexNum >= frames.length) {
            logger.error(
              `Frame index ${frameIndexNum} out of range. Available frames: 0-${frames.length - 1} for direction ${objectLayerFrameDirection}`,
            );
            process.exit(1);
          }

          const itemKey = objectLayer.data.item.id;
          const outputPath = `./${itemKey}_${showFrameInput}.png`;

          await buildImgFromTile({
            tile: {
              map_color: objectLayer.objectLayerRenderFramesId.colors,
              frame_matrix: frames[frameIndexNum],
            },
            cellPixelDim: 20,
            opacityFilter: (x, y, color) => 255,
            imagePath: outputPath,
          });

          logger.info(`Frame saved to: ${outputPath}`);
          shellExec(`firefox ${outputPath}`);
        }

        // ── Handle --to-atlas-sprite-sheet ───────────────────────────────
        if (options.toAtlasSpriteSheet !== undefined) {
          // If toAtlasSpriteSheet is true (flag without value), use null for auto-calc
          // If it's a string/number, parse it as integer
          /** @type {number|null} */
          const maxAtlasDim = options.toAtlasSpriteSheet === true ? null : parseInt(options.toAtlasSpriteSheet) || null;

          if (!itemId) {
            logger.error('item-id is required for --to-atlas-sprite-sheet');
            process.exit(1);
          }

          if (maxAtlasDim) {
            /** @type {string} */
            const sizeRecommendation =
              maxAtlasDim < 2048
                ? ' (Warning: May be too small for all frames)'
                : maxAtlasDim > 4096
                  ? ' (Large size: ensure GPU compatibility)'
                  : ' (Recommended size)';

            logger.info(
              `Generating atlas sprite sheet for item: ${itemId} with max dimension: ${maxAtlasDim}x${maxAtlasDim}${sizeRecommendation}`,
            );
          } else {
            logger.info(
              `Generating atlas sprite sheet for item: ${itemId} with auto-calculated dimensions (based on frame count)`,
            );
          }

          // Find ObjectLayer by item-id
          const objectLayer = await ObjectLayer.findOne({ 'data.item.id': itemId }).populate(
            'objectLayerRenderFramesId',
          );

          if (!objectLayer) {
            logger.error(`ObjectLayer not found for item-id: ${itemId}`);
            process.exit(1);
          }

          const itemKey = objectLayer.data.item.id;
          logger.info(`Found ObjectLayer: ${itemKey} (${objectLayer._id})`);

          // Generate atlas sprite sheet
          const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
            objectLayer.objectLayerRenderFramesId,
            itemKey,
            20, // cellPixelDim
            maxAtlasDim,
          );

          /** @type {number} */
          const frameCount = Object.values(metadata.frames).reduce((sum, frames) => sum + frames.length, 0);
          logger.info(
            `Atlas generated: ${metadata.atlasWidth}x${metadata.atlasHeight} pixels (${frameCount} frames packed)`,
          );

          // Save to File collection
          const fileDoc = await new File({
            name: `${itemKey}-atlas.png`,
            data: buffer,
            size: buffer.length,
            mimetype: 'image/png',
            md5: crypto.createHash('md5').update(buffer).digest('hex'),
          }).save();

          logger.info(`File saved with ID: ${fileDoc._id}`);

          // Check if atlas sprite sheet already exists
          let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });

          if (atlasDoc) {
            // Update existing
            atlasDoc.fileId = fileDoc._id;
            atlasDoc.metadata = metadata;
            await atlasDoc.save();
            logger.info(`Updated existing AtlasSpriteSheet document: ${atlasDoc._id}`);
          } else {
            // Create new
            atlasDoc = await new AtlasSpriteSheet({
              fileId: fileDoc._id,
              metadata,
            }).save();
            logger.info(`Created new AtlasSpriteSheet document: ${atlasDoc._id}`);
          }

          // Update ObjectLayer with reference to atlas sprite sheet (top-level)
          objectLayer.atlasSpriteSheetId = atlasDoc._id;
          await objectLayer.save();

          logger.info(`Atlas sprite sheet completed for item: ${itemKey}`);
        }

        // ── Handle --show-atlas-sprite-sheet ─────────────────────────────
        if (options.showAtlasSpriteSheet) {
          if (!itemId) {
            logger.error('item-id is required for --show-atlas-sprite-sheet');
            process.exit(1);
          }

          logger.info(`Looking up atlas sprite sheet for item: ${itemId}`);

          // Find ObjectLayer by item-id
          const objectLayer = await ObjectLayer.findOne({ 'data.item.id': itemId });

          if (!objectLayer) {
            logger.error(`ObjectLayer not found for item-id: ${itemId}`);
            process.exit(1);
          }

          // Find atlas sprite sheet
          const atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': objectLayer.data.item.id }).populate(
            'fileId',
          );

          if (!atlasDoc || !atlasDoc.fileId) {
            logger.error(
              `Atlas sprite sheet not found for item: ${itemId}. Generate it first with --to-atlas-sprite-sheet`,
            );
            process.exit(1);
          }

          const itemKey = objectLayer.data.item.id;
          const outputPath = `./${itemKey}-atlas.png`;

          // Write file to disk
          await fs.writeFile(outputPath, atlasDoc.fileId.data);
          logger.info(`Atlas sprite sheet saved to: ${outputPath}`);

          // Open with firefox
          shellExec(`firefox ${outputPath}`);

          logger.info(
            `Atlas sprite sheet dimensions: ${atlasDoc.metadata.atlasWidth}x${atlasDoc.metadata.atlasHeight}`,
          );
        }

        // ── Handle --generate ────────────────────────────────────────────
        if (options.generate) {
          if (!itemId) {
            logger.error(
              'item-id is required for --generate (e.g. floor-desert, floor-grass, floor-water, floor-stone, floor-lava)',
            );
            logger.info('Available semantic prefixes: ' + Object.keys(semanticRegistry).join(', '));
            process.exit(1);
          }

          const descriptor = lookupSemantic(itemId);
          if (!descriptor) {
            logger.error(`No semantic descriptor found for item-id "${itemId}".`);
            logger.info('Available semantic prefixes: ' + Object.keys(semanticRegistry).join(', '));
            process.exit(1);
          }

          const genSeed = options.seed || `gen-${crypto.randomUUID().slice(0, 8)}`;
          const genCount = options.count || 3;
          const genFrameIndex = options.frameIndex || 0;
          const genFrameCount = options.frameCount || 1;
          const genDensity = options.density != null ? options.density : 0.5;

          // Append a random suffix to make the item-id unique per run
          const randStr = crypto.randomUUID().slice(0, 8);
          const uniqueItemId = `${itemId}-${randStr}`;

          logger.info('Generating procedural object layers', {
            itemId: uniqueItemId,
            basePrefix: itemId,
            seed: genSeed,
            count: genCount,
            startFrame: genFrameIndex,
            frameCount: genFrameCount,
            density: genDensity,
            semanticTags: descriptor.semanticTags,
            itemType: descriptor.itemType,
            layers: Object.keys(descriptor.layers),
          });

          // 1. Generate multi-frame result (deterministic, temporally coherent)
          //    Pass the base itemId for semantic lookup, but override the stored
          //    item.id with uniqueItemId so every run produces a distinct asset.
          const multiFrameResult = generateMultiFrame({
            itemId,
            seed: genSeed,
            frameCount: genFrameCount,
            startFrame: genFrameIndex,
            count: genCount,
            density: genDensity,
          });

          // Overwrite the item id in the generated data with the unique variant
          multiFrameResult.objectLayerData.data.item.id = uniqueItemId;

          logger.info(
            `Generated ${multiFrameResult.frameCount} frame(s) with ${multiFrameResult.objectLayerRenderFramesData.colors.length} unique colors`,
          );

          // 2. Write static asset PNGs to both source and public directories
          const srcBasePath = './src/client/public/cyberia/';
          const publicBasePath = `./public/${host}${path}`;
          const writtenFiles = await ObjectLayerEngine.writeStaticFrameAssets({
            basePaths: [srcBasePath, publicBasePath],
            itemType: descriptor.itemType,
            itemId: uniqueItemId,
            objectLayerRenderFramesData: multiFrameResult.objectLayerRenderFramesData,
            objectLayerData: multiFrameResult.objectLayerData,
            cellPixelDim: 20,
          });

          logger.info(`Wrote ${writtenFiles.length} asset file(s):`);
          for (const f of writtenFiles) {
            logger.info(`  → ${f}`);
          }

          // 3. Persist to MongoDB (ObjectLayerRenderFrames + ObjectLayer)
          const { objectLayer } = await ObjectLayerEngine.createObjectLayerDocuments({
            ObjectLayer,
            ObjectLayerRenderFrames,
            objectLayerRenderFramesData: multiFrameResult.objectLayerRenderFramesData,
            objectLayerData: multiFrameResult.objectLayerData,
            createOptions: {
              generateAtlas: false,
            },
          });

          logger.info(`ObjectLayer persisted to MongoDB: ${objectLayer._id} (item: ${objectLayer.data.item.id})`);

          // 4. Generate atlas sprite sheet + pin to IPFS
          let atlasCid = '';
          try {
            const atlasItemKey = objectLayer.data.item.id;
            const populatedObjectLayer = await ObjectLayer.findById(objectLayer._id).populate(
              'objectLayerRenderFramesId',
            );

            const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
              populatedObjectLayer.objectLayerRenderFramesId,
              atlasItemKey,
              20,
            );

            // Save atlas file to File collection
            const fileDoc = await new File({
              name: `${atlasItemKey}-atlas.png`,
              data: buffer,
              size: buffer.length,
              mimetype: 'image/png',
              md5: crypto.createHash('md5').update(buffer).digest('hex'),
            }).save();

            // Pin atlas PNG to IPFS + copy into MFS
            try {
              const ipfsResult = await IpfsClient.addBufferToIpfs(
                buffer,
                `${atlasItemKey}_atlas_sprite_sheet.png`,
                `/object-layer/${atlasItemKey}/${atlasItemKey}_atlas_sprite_sheet.png`,
              );
              if (ipfsResult) {
                atlasCid = ipfsResult.cid;
                logger.info(`Atlas sprite sheet pinned to IPFS – CID: ${atlasCid}`);
              }
            } catch (ipfsError) {
              logger.warn('Failed to add atlas sprite sheet to IPFS:', ipfsError.message);
            }

            // Upsert AtlasSpriteSheet document (with CID)
            let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': atlasItemKey });
            if (atlasDoc) {
              atlasDoc.fileId = fileDoc._id;
              atlasDoc.cid = atlasCid;
              atlasDoc.metadata = metadata;
              await atlasDoc.save();
              logger.info(`Updated existing AtlasSpriteSheet document: ${atlasDoc._id}`);
            } else {
              atlasDoc = await new AtlasSpriteSheet({
                fileId: fileDoc._id,
                cid: atlasCid,
                metadata,
              }).save();
              logger.info(`Created new AtlasSpriteSheet document: ${atlasDoc._id}`);
            }

            // Link atlas to ObjectLayer and set data.atlasSpriteSheetCid
            populatedObjectLayer.atlasSpriteSheetId = atlasDoc._id;
            populatedObjectLayer.data.atlasSpriteSheetCid = atlasCid;
            populatedObjectLayer.markModified('data.atlasSpriteSheetCid');
            await populatedObjectLayer.save();

            // Also write atlas PNG to both static asset directories
            for (const bp of [srcBasePath, publicBasePath]) {
              const atlasOutputDir = nodePath.join(bp, 'assets', descriptor.itemType, uniqueItemId);
              await fs.ensureDir(atlasOutputDir);
              const atlasOutputPath = nodePath.join(atlasOutputDir, `${atlasItemKey}-atlas.png`);
              await fs.writeFile(atlasOutputPath, buffer);
              logger.info(
                `Atlas sprite sheet generated: ${metadata.atlasWidth}x${metadata.atlasHeight} → ${atlasOutputPath}`,
              );
            }
          } catch (atlasError) {
            logger.error(`Failed to generate atlas for ${uniqueItemId}:`, atlasError);
          }

          // 5. Compute final SHA-256, pin OL data JSON to IPFS, create pin records
          try {
            const finalObjectLayer = await ObjectLayer.findById(objectLayer._id).populate('objectLayerRenderFramesId');
            const finalized = await ObjectLayerEngine.computeAndSaveFinalSha256({
              objectLayer: finalObjectLayer,
              ipfsClient: IpfsClient,
              createPinRecord,
              userId: undefined, // CLI context has no authenticated user
              options: { host, path },
            });
            logger.info(`Final SHA-256: ${finalized.sha256}`);
            if (finalized.cid) {
              logger.info(`ObjectLayer data pinned to IPFS – CID: ${finalized.cid}`);
            }
          } catch (finalizeError) {
            logger.error('Failed to finalize SHA-256 / IPFS:', finalizeError);
          }

          logger.info(`✓ Generation complete for "${uniqueItemId}" (seed: ${genSeed}, frames: ${genFrameCount})`);

          // Log per-layer summary
          if (multiFrameResult.frames.length > 0) {
            const firstFrame = multiFrameResult.frames[0];
            for (const layer of firstFrame.layers) {
              logger.info(`  Layer "${layer.layerKey}" (${layer.layerId}): ${layer.keys.length} element(s)`);
            }
          }
        }

        await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
      },
    )
    .description('Object layer management');

  if (process.argv[2] == 'underpost') throw new Error('Trigger underpost passthrough');

  program.parse();
} catch (error) {
  logger.warn(error);
  process.argv = process.argv.filter((c) => c !== 'underpost');
  logger.warn('Rerouting to underpost cli...');
  try {
    underpostProgram.parse();
  } catch (error) {
    logger.error(error);
  }
}
