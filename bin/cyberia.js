#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { shellExec, shellCd } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import {
  pngDirectoryIteratorByObjectLayerType,
  getKeyFramesDirectionsFromNumberFolderDirection,
  processAndPushFrame,
  buildImgFromTile,
  generateRandomStats,
  itemTypes,
} from '../src/server/object-layer.js';
import { AtlasSpriteSheetGenerator } from '../src/server/atlas-sprite-sheet-generator.js';
import { program as underpostProgram } from '../src/cli/index.js';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import Underpost from '../src/index.js';
const logger = loggerFactory(import.meta);
try {
  const program = new Command();

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
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--storage-file-path <storage-file-path>', 'Storage file path override')
    .option('--drop', 'Drop existing data before importing')
    .action(
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
        },
      ) => {
        if (!options.envPath) options.envPath = `./.env`;
        if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

        const deployId = process.env.DEFAULT_DEPLOY_ID;
        const host = process.env.DEFAULT_DEPLOY_HOST;
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
          apis: ['object-layer', 'object-layer-render-frames', 'atlas-sprite-sheet', 'file'],
          host,
          path,
          db,
        });

        const ObjectLayer = DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayer;
        const ObjectLayerRenderFrames =
          DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayerRenderFrames;
        const AtlasSpriteSheet = DataBaseProvider.instance[`${host}${path}`].mongoose.models.AtlasSpriteSheet;
        const File = DataBaseProvider.instance[`${host}${path}`].mongoose.models.File;

        if (options.drop) {
          await ObjectLayer.deleteMany();
          await ObjectLayerRenderFrames.deleteMany();
          shellExec(`cd src/client/public/cyberia && underpost run clean .`);
        }

        const storage = options.storageFilePath ? JSON.parse(fs.readFileSync(options.storageFilePath, 'utf8')) : null;

        const objectLayers = {};

        if (options.import) {
          const argItemTypes = options.import === 'all' ? Object.keys(itemTypes) : options.import.split(',');
          for (const argItemType of argItemTypes) {
            await pngDirectoryIteratorByObjectLayerType(
              argItemType,
              async ({ path, objectLayerType, objectLayerId, direction, frame }) => {
                if (
                  storage &&
                  !storage[`src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/08/0.png`]
                )
                  return;
                console.log(path, { objectLayerType, objectLayerId, direction, frame });
                if (!objectLayers[objectLayerId]) {
                  const metadataPath = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/metadata.json`;
                  const metadata = fs.existsSync(metadataPath)
                    ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
                    : null;

                  if (metadata) {
                    // Use metadata from file but ensure objectLayerRenderFramesData is initialized
                    objectLayers[objectLayerId] = metadata;

                    // Ensure data.seed exists (required field)
                    if (!objectLayers[objectLayerId].data.seed) {
                      objectLayers[objectLayerId].data.seed = crypto.randomUUID();
                    }

                    // Ensure objectLayerRenderFramesData exists
                    if (!objectLayers[objectLayerId].objectLayerRenderFramesData) {
                      objectLayers[objectLayerId].objectLayerRenderFramesData = {
                        frames: {},
                        colors: [],
                        frame_duration: metadata.data?.render?.frame_duration || 250,
                        is_stateless: metadata.data?.render?.is_stateless || false,
                      };
                    }
                  } else {
                    // Create default structure
                    objectLayers[objectLayerId] = {
                      data: {
                        item: {
                          id: objectLayerId,
                          type: objectLayerType,
                          description: '',
                          activable: true,
                        },
                        stats: generateRandomStats(),
                        seed: crypto.randomUUID(),
                      },
                      objectLayerRenderFramesData: {
                        frames: {},
                        colors: [],
                        frame_duration: 250,
                        is_stateless: false,
                      },
                    };
                  }
                }
                await processAndPushFrame(objectLayers[objectLayerId].objectLayerRenderFramesData, path, direction);
              },
            );
          }
          for (const objectLayerId of Object.keys(objectLayers)) {
            // Create ObjectLayerRenderFrames document
            const objectLayerRenderFramesDoc = await new ObjectLayerRenderFrames(
              objectLayers[objectLayerId].objectLayerRenderFramesData,
            ).save();

            // Update ObjectLayer with reference to render frames (top-level, not in data)
            objectLayers[objectLayerId].objectLayerRenderFramesId = objectLayerRenderFramesDoc._id;

            // Generate SHA256 hash using fast-json-stable-stringify (seed is part of data)
            objectLayers[objectLayerId].sha256 = crypto
              .createHash('sha256')
              .update(stringify(objectLayers[objectLayerId].data))
              .digest('hex');

            console.log(await ObjectLayer.create(objectLayers[objectLayerId]));
          }
        }
        if (options.showFrame !== undefined) {
          if (!itemId) {
            logger.error('item-id is required for --show-frame');
            process.exit(1);
          }

          // Parse direction and frame (default: 08_0)
          const showFrameInput = options.showFrame === true ? '08_0' : options.showFrame;
          const [direction, frameIndex] = showFrameInput.split('_');
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

        // Handle --to-atlas-sprite-sheet
        if (options.toAtlasSpriteSheet !== undefined) {
          // If toAtlasSpriteSheet is true (flag without value), use null for auto-calc
          // If it's a string/number, parse it as integer
          const maxAtlasDim = options.toAtlasSpriteSheet === true ? null : parseInt(options.toAtlasSpriteSheet) || null;

          if (!itemId) {
            logger.error('item-id is required for --to-atlas-sprite-sheet');
            process.exit(1);
          }

          if (maxAtlasDim) {
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

        // Handle --show-atlas-sprite-sheet
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
