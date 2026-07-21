#! /usr/bin/env node

/**
 * Cyberia Online CLI for object layer management.
 * Provides commands for importing, viewing, and managing object layer assets,
 * render frames, and atlas sprite sheets from the command line.
 *
 * @module bin/cyberia.js
 * @namespace CyberiaCLI
 */

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import stringify from 'fast-json-stable-stringify';
import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { generateBesuManifests, deployBesu, removeBesu } from '../src/projects/cyberia/besu-genesis-generator.js';
import { DataBaseProviderService } from '../src/db/DataBaseProvider.js';
import { loadConfServerJson } from '../src/server/conf.js';
import {
  ObjectLayerEngine,
  resolveCanonicalCid,
  pngDirectoryIteratorByObjectLayerType,
  buildImgFromTile,
} from '../src/projects/cyberia/object-layer.js';
import { getKeyframeDirectionsByCode } from '../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { AtlasSpriteSheetGenerator } from '../src/projects/cyberia/atlas-sprite-sheet-generator.js';
import {
  generateMultiFrame,
  lookupSemantic,
  semanticRegistry,
} from '../src/projects/cyberia/semantic-layer-generator.js';
import { IpfsClient } from '../src/projects/cyberia/ipfs-client.js';
import { createPinRecord } from '../src/api/ipfs/ipfs.service.js';
import { program as underpostProgram } from '../src/cli/index.js';
import { generateSaga, importSaga } from '../src/projects/cyberia/generate-saga.js';
import crypto from 'crypto';
import nodePath from 'path';
import Underpost from '../src/index.js';
import { newInstance } from '../src/client/components/core/CommonJs.js';
import {
  DefaultSkillConfig,
  DefaultCyberiaDialogues,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  ENTITY_TYPE_DEFAULTS,
  fillInstanceConfDefaults,
} from '../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

import {
  ITEM_TYPES as itemTypes,
  DefaultCyberiaItems,
} from '../src/client/components/cyberia/SharedDefaultsCyberia.js';

/**
 * Connect to the project MongoDB instance using the standard env / conf layout.
 *
 * @async
 * @function connectDbForChain
 * @param {Object} params
 * @param {string} params.envPath   – path to .env file.
 * @param {string} [params.mongoHost] – optional mongo host override.
 * @returns {Promise<{ ObjectLayer: import('mongoose').Model, host: string, path: string }>}
 * @memberof CyberiaCLI
 */
async function connectDbForChain({ envPath, mongoHost }) {
  const deployId = process.env.DEFAULT_DEPLOY_ID;
  const host = process.env.DEFAULT_DEPLOY_HOST;
  const path = process.env.DEFAULT_DEPLOY_PATH;

  const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
  if (!fs.existsSync(confServerPath)) {
    throw new Error(`Server config not found: ${confServerPath}. Ensure DEFAULT_DEPLOY_ID is set.`);
  }
  const confServer = loadConfServerJson(confServerPath, { resolve: true });
  const { db } = confServer[host][path];

  db.host = mongoHost ? mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

  await DataBaseProviderService.load({
    apis: ['object-layer'],
    host,
    path,
    db,
  });

  const ObjectLayer = DataBaseProviderService.getModel('object-layer', { host, path });
  return { ObjectLayer, host, path };
}

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
    .option(
      '--import',
      'Import specific item-id(s) passed as comma-separated command argument (e.g. ol hatchet,sword --import)',
    )
    .option('--import-types [object-layer-type]', 'Batch import by object layer type e.g. skin,floors or all')
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
    .option('--client-public', 'When used with --drop, also remove static asset folders for dropped items')
    .option('--git-clean', 'When used with --drop, run underpost clean on the cyberia asset directory')
    .option('--dev', 'Force development environment (loads .env.development for IPFS localhost, etc.)')
    .action(
      /**
       * Main action handler for the `ol` command.
       * Manages object layer import, frame viewing, atlas generation, and atlas display.
       *
       * @param {string|undefined} itemId - Optional item ID argument.
       * @param {Object} options - Command options parsed by Commander.
       * @param {boolean} options.import - Import specific item-id(s) from the command argument (comma-separated).
       * @param {boolean|string} options.importTypes - Object layer types to batch import (e.g., 'all', 'skin,floor') or `false`.
       * @param {boolean|string} options.showFrame - Direction-frame string (e.g., '08_0') or `true` for default.
       * @param {string} options.envPath - Path to the `.env` file.
       * @param {string} options.mongoHost - MongoDB host override.
       * @param {string} options.storageFilePath - Path to a storage filter JSON file.
       * @param {boolean|string} options.toAtlasSpriteSheet - Atlas dimension or `true` for auto-calc.
       * @param {boolean} options.showAtlasSpriteSheet - Whether to display the atlas sprite sheet.
       * @param {boolean} options.drop - Whether to drop existing data before importing.
       * @param {boolean} options.clientPublic - Also remove static asset folders when dropping.
       * @param {boolean} options.gitClean - Run underpost clean on the cyberia asset directory when dropping.
       * @param {boolean} options.dev - Force development environment.
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
          importTypes: false,
          showFrame: '',
          envPath: '',
          mongoHost: '',
          storageFilePath: '',
          toAtlasSpriteSheet: '',
          showAtlasSpriteSheet: false,
          drop: false,
          clientPublic: false,
          gitClean: false,
          dev: false,
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

        // --dev: force development environment (IPFS localhost, etc.)
        if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
          const deployDevEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
          if (fs.existsSync(deployDevEnvPath)) {
            dotenv.config({ path: deployDevEnvPath, override: true });
          }
        }

        /** @type {string} */
        const deployId = process.env.DEFAULT_DEPLOY_ID;
        /** @type {string} */
        const host = process.env.DEFAULT_DEPLOY_HOST;
        /** @type {string} */
        const path = process.env.DEFAULT_DEPLOY_PATH;

        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const confServer = loadConfServerJson(confServerPath, { resolve: true });
        const { db } = confServer[host][path];

        db.host = options.mongoHost
          ? options.mongoHost
          : options.dev
            ? db.host
            : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

        logger.info('env', {
          env: options.envPath,
          deployId,
          host,
          path,
          db,
        });

        await DataBaseProviderService.load({
          apis: ['object-layer', 'object-layer-render-frames', 'atlas-sprite-sheet', 'file', 'ipfs'],
          host,
          path,
          db,
        });

        /** @type {import('mongoose').Model} */
        const ObjectLayer = DataBaseProviderService.getModel('object-layer', { host, path });
        /** @type {import('mongoose').Model} */
        const ObjectLayerRenderFrames = DataBaseProviderService.getModel('object-layer-render-frames', { host, path });
        /** @type {import('mongoose').Model} */
        const AtlasSpriteSheet = DataBaseProviderService.getModel('atlas-sprite-sheet', { host, path });
        /** @type {import('mongoose').Model} */
        const File = DataBaseProviderService.getModel('file', { host, path });
        /** @type {import('mongoose').Model} */
        const Ipfs = DataBaseProviderService.getModel('ipfs', { host, path });

        if (options.drop) {
          // Parse comma-separated item IDs for targeted drop; if none provided, drop everything
          const dropItemIds = itemId
            ? itemId
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
            : null;
          const isTargetedDrop = dropItemIds && dropItemIds.length > 0;

          if (isTargetedDrop) {
            logger.info(`Targeted drop for item(s): ${dropItemIds.join(', ')}`);
          } else {
            logger.info('Dropping ALL object layer data');
          }

          // Build query filter: targeted or all
          const olFilter = isTargetedDrop ? { 'data.item.id': { $in: dropItemIds } } : {};
          const atlasFilter = isTargetedDrop ? { 'metadata.itemKey': { $in: dropItemIds } } : {};

          // Collect data before deletion
          const olDocs = await ObjectLayer.find(olFilter, {
            cid: 1,
            'data.item.id': 1,
            'data.item.type': 1,
            'data.render': 1,
            objectLayerRenderFramesId: 1,
            atlasSpriteSheetId: 1,
          }).lean();
          const atlasDocs = await AtlasSpriteSheet.find(atlasFilter, { fileId: 1, cid: 1 }).lean();

          const cidsToUnpin = new Set();
          const itemIdsToClean = new Set();
          const renderFrameIds = [];
          const atlasIds = [];

          for (const doc of olDocs) {
            if (doc.cid) cidsToUnpin.add(doc.cid);
            if (doc.data?.render?.cid) cidsToUnpin.add(doc.data.render.cid);
            if (doc.data?.render?.metadataCid) cidsToUnpin.add(doc.data.render.metadataCid);
            if (doc.data?.item?.id) itemIdsToClean.add(doc.data.item.id);
            if (doc.objectLayerRenderFramesId) renderFrameIds.push(doc.objectLayerRenderFramesId);
            if (doc.atlasSpriteSheetId) atlasIds.push(doc.atlasSpriteSheetId);
          }

          const atlasFileIds = atlasDocs.map((a) => a.fileId).filter(Boolean);
          for (const atlas of atlasDocs) {
            if (atlas.cid) cidsToUnpin.add(atlas.cid);
          }

          const olCount = olDocs.length;
          const atlasCount = atlasDocs.length;

          // Delete targeted documents
          if (isTargetedDrop) {
            const olIds = olDocs.map((d) => d._id);
            if (olIds.length > 0) await ObjectLayer.deleteMany({ _id: { $in: olIds } });
            if (renderFrameIds.length > 0) await ObjectLayerRenderFrames.deleteMany({ _id: { $in: renderFrameIds } });
            if (atlasIds.length > 0) await AtlasSpriteSheet.deleteMany({ _id: { $in: atlasIds } });
          } else {
            await ObjectLayer.deleteMany();
            await ObjectLayerRenderFrames.deleteMany();
            await AtlasSpriteSheet.deleteMany();
          }

          const rfCount = renderFrameIds.length;

          // Remove only the File documents that were referenced by atlas sprite sheets
          let fileCount = 0;
          if (atlasFileIds.length > 0) {
            const result = await File.deleteMany({ _id: { $in: atlasFileIds } });
            fileCount = result.deletedCount || 0;
          }

          // Delete IPFS pin registry records for all collected CIDs
          if (cidsToUnpin.size > 0) {
            const ipfsResult = await Ipfs.deleteMany({ cid: { $in: [...cidsToUnpin] } });
            logger.info(`Dropped ${ipfsResult.deletedCount} Ipfs pin record(s)`);
          }

          // Unpin CIDs from IPFS Cluster + Kubo and remove MFS directories
          let unpinCount = 0;
          let mfsCount = 0;
          for (const cid of cidsToUnpin) {
            const ok = await IpfsClient.unpinCid(cid);
            if (ok) unpinCount++;
          }
          for (const itemKey of itemIdsToClean) {
            const ok = await IpfsClient.removeMfsPath(`/object-layer/${itemKey}`);
            if (ok) mfsCount++;
          }

          logger.info(
            `Dropped: ${olCount} ObjectLayer, ${rfCount} RenderFrames, ${atlasCount} AtlasSpriteSheet, ${fileCount} File (atlas)`,
          );
          logger.info(
            `IPFS cleanup: ${unpinCount}/${cidsToUnpin.size} CIDs unpinned, ${mfsCount}/${itemIdsToClean.size} MFS paths removed`,
          );
          if (options.gitClean) {
            shellExec(`cd src/client/public/cyberia && underpost run clean .`);
            logger.info('Asset directory cleaned');
          }

          // --client-public: remove static asset folders for dropped items
          if (options.clientPublic) {
            const srcBase = './src/client/public/cyberia/assets';
            const publicBase = `./public/${host}${path}/assets`;
            let removedCount = 0;
            for (const doc of olDocs) {
              const docItemId = doc.data?.item?.id;
              const docItemType = doc.data?.item?.type;
              if (!docItemId || !docItemType) continue;
              for (const base of [srcBase, publicBase]) {
                const folder = `${base}/${docItemType}/${docItemId}`;
                if (fs.existsSync(folder)) {
                  fs.removeSync(folder);
                  removedCount++;
                  logger.info(`Removed static folder: ${folder}`);
                }
              }
            }
            logger.info(`Static asset cleanup: ${removedCount} folder(s) removed`);
          }
        }

        /** @type {Object|null} */
        const storage = options.storageFilePath ? JSON.parse(fs.readFileSync(options.storageFilePath, 'utf8')) : null;

        // ── Handle --import (specific item-id(s)) ─────────────────────
        if (options.import) {
          if (!itemId) {
            logger.error('item-id is required for --import (comma-separated item IDs, e.g. ol hatchet,sword --import)');
            process.exit(1);
          }

          const itemIds = itemId
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
          logger.info(`Importing specific item(s): ${itemIds.join(', ')}`);

          for (const currentItemId of itemIds) {
            // Search across all asset type directories to find which type contains this item-id
            let foundType = null;
            let foundFolder = null;
            for (const type of Object.keys(itemTypes)) {
              const candidateFolder = `./src/client/public/cyberia/assets/${type}/${currentItemId}`;
              if (fs.existsSync(candidateFolder) && fs.statSync(candidateFolder).isDirectory()) {
                foundType = type;
                foundFolder = candidateFolder;
                break;
              }
            }

            if (!foundType) {
              logger.error(
                `Item-id '${currentItemId}' not found in any asset type directory (${Object.keys(itemTypes).join(', ')})`,
              );
              continue;
            }

            logger.info(`Found item '${currentItemId}' in type '${foundType}' at ${foundFolder}`);

            const { objectLayerRenderFramesData, objectLayerData } =
              await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
                folder: foundFolder,
                objectLayerType: foundType,
                objectLayerId: currentItemId,
              });

            // Write processed frames back to disk so WebP matches atlas
            const srcBasePath = './src/client/public/cyberia/';
            const publicBasePath = `./public/${host}${path}`;
            await ObjectLayerEngine.writeStaticFrameAssets({
              basePaths: [srcBasePath, publicBasePath],
              itemType: foundType,
              itemId: currentItemId,
              objectLayerRenderFramesData,
              objectLayerData,
              cellPixelDim: 20,
            });

            // Check if an ObjectLayer with the same item.id already exists (upsert by item ID)
            const existingOL = await ObjectLayer.findOne({ 'data.item.id': currentItemId });
            let objectLayer;

            if (existingOL) {
              // ── Cut-over consistency: stage everything in memory before touching the live document ──
              logger.info(`ObjectLayer '${currentItemId}' already exists (${existingOL._id}), staging update...`);

              // 1. Prepare staging data entirely in memory (no DB writes yet)
              const stagingData = JSON.parse(JSON.stringify(objectLayerData.data));
              if (!stagingData.render) stagingData.render = {};
              stagingData.render.cid = '';
              stagingData.render.metadataCid = '';

              // 2. Generate atlas, pin to IPFS, compute SHA-256 — all in memory
              let cutoverReady = false;
              let stagingFileDoc = null;
              let stagingAtlasDoc = null;
              let stagingCid = '';
              let stagingSha256 = '';
              try {
                const itemKey = currentItemId;

                // Generate atlas from in-memory render frames data (plain object, no DB doc needed)
                const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
                  objectLayerRenderFramesData,
                  itemKey,
                  20,
                );

                stagingFileDoc = await new File({
                  name: `${itemKey}-atlas.png`,
                  data: buffer,
                  size: buffer.length,
                  mimetype: 'image/png',
                  md5: crypto.createHash('md5').update(buffer).digest('hex'),
                }).save();

                let importItemCid = '';
                let importItemMetadataCid = '';
                try {
                  const ipfsResult = await IpfsClient.addBufferToIpfs(
                    buffer,
                    `${itemKey}_atlas_sprite_sheet.png`,
                    `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                  );
                  if (ipfsResult) {
                    importItemCid = ipfsResult.cid;
                    logger.info(`[staging] Atlas pinned to IPFS – CID: ${importItemCid}`);
                    try {
                      await createPinRecord({
                        cid: importItemCid,
                        resourceType: 'atlas-sprite-sheet',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create atlas pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to add atlas to IPFS:', ipfsError.message);
                }

                try {
                  const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
                    metadata,
                    `${itemKey}_atlas_sprite_sheet_metadata.json`,
                    `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                  );
                  if (metadataIpfsResult) {
                    importItemMetadataCid = metadataIpfsResult.cid;
                    logger.info(`[staging] Atlas metadata pinned to IPFS – CID: ${importItemMetadataCid}`);
                    try {
                      await createPinRecord({
                        cid: importItemMetadataCid,
                        resourceType: 'atlas-metadata',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create atlas-metadata pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to add atlas metadata to IPFS:', ipfsError.message);
                }

                // Persist atlas doc (or update existing one for this itemKey)
                stagingAtlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
                if (stagingAtlasDoc) {
                  if (stagingAtlasDoc.fileId) await File.findByIdAndDelete(stagingAtlasDoc.fileId);
                  stagingAtlasDoc.fileId = stagingFileDoc._id;
                  stagingAtlasDoc.cid = importItemCid;
                  stagingAtlasDoc.metadata = metadata;
                  await stagingAtlasDoc.save();
                } else {
                  stagingAtlasDoc = await new AtlasSpriteSheet({
                    fileId: stagingFileDoc._id,
                    cid: importItemCid,
                    metadata,
                  }).save();
                }

                // Finalize staging data in memory with render CIDs
                stagingData.render.cid = importItemCid;
                stagingData.render.metadataCid = importItemMetadataCid;

                // Pin data JSON to IPFS (compute final SHA-256 in memory)
                stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);
                try {
                  const ipfsDataResult = await IpfsClient.addJsonToIpfs(
                    stagingData,
                    `${itemKey}_data.json`,
                    `/object-layer/${itemKey}/${itemKey}_data.json`,
                  );
                  if (ipfsDataResult) {
                    stagingCid = ipfsDataResult.cid;
                    logger.info(`[staging] Data JSON pinned to IPFS – CID: ${stagingCid}`);
                    try {
                      await createPinRecord({
                        cid: stagingCid,
                        resourceType: 'object-layer-data',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_data.json`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create data pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to pin data JSON to IPFS:', ipfsError.message);
                }

                cutoverReady = true;
                logger.info(`[staging] Item '${itemKey}' fully staged in memory, ready for cut-over`);
              } catch (atlasError) {
                logger.error(`[staging] Failed for ${currentItemId}, live document untouched:`, atlasError);
              }

              // 3. Atomic cut-over: create new RenderFrames, swap live ObjectLayer in a single update
              if (cutoverReady) {
                const oldRenderFramesId = existingOL.objectLayerRenderFramesId;

                // Create the new RenderFrames doc (only now touches DB)
                const newRenderFrames = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);

                // Single atomic update of the live document
                await ObjectLayer.findByIdAndUpdate(existingOL._id, {
                  data: stagingData,
                  sha256: stagingSha256,
                  cid: stagingCid,
                  objectLayerRenderFramesId: newRenderFrames._id,
                  atlasSpriteSheetId: stagingAtlasDoc._id,
                });

                // Clean up old render frames
                if (oldRenderFramesId) {
                  await ObjectLayerRenderFrames.findByIdAndDelete(oldRenderFramesId);
                }

                logger.info(`[cut-over] Live document ${existingOL._id} updated atomically`);
              } else {
                // Rollback: only File/AtlasSpriteSheet were written, clean those up
                if (stagingFileDoc) await File.findByIdAndDelete(stagingFileDoc._id);
                logger.warn(`[cut-over] Staging rolled back for ${currentItemId}, live document preserved`);
              }

              objectLayer = await ObjectLayer.findById(existingOL._id);
            } else {
              // ── New item: stage everything before creating (same cut-over pattern) ──
              logger.info(`ObjectLayer '${currentItemId}' is new, staging creation...`);

              const itemKey = currentItemId;
              const stagingData = JSON.parse(JSON.stringify(objectLayerData.data));
              if (!stagingData.render) stagingData.render = {};
              stagingData.render.cid = '';
              stagingData.render.metadataCid = '';

              let cutoverReady = false;
              let stagingFileDoc = null;
              let stagingAtlasDoc = null;
              let stagingCid = '';
              let stagingSha256 = '';
              try {
                const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
                  objectLayerRenderFramesData,
                  itemKey,
                  20,
                );

                stagingFileDoc = await new File({
                  name: `${itemKey}-atlas.png`,
                  data: buffer,
                  size: buffer.length,
                  mimetype: 'image/png',
                  md5: crypto.createHash('md5').update(buffer).digest('hex'),
                }).save();

                let importItemCid = '';
                let importItemMetadataCid = '';
                try {
                  const ipfsResult = await IpfsClient.addBufferToIpfs(
                    buffer,
                    `${itemKey}_atlas_sprite_sheet.png`,
                    `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                  );
                  if (ipfsResult) {
                    importItemCid = ipfsResult.cid;
                    logger.info(`[staging] Atlas pinned to IPFS – CID: ${importItemCid}`);
                    try {
                      await createPinRecord({
                        cid: importItemCid,
                        resourceType: 'atlas-sprite-sheet',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create atlas pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to add atlas to IPFS:', ipfsError.message);
                }

                try {
                  const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
                    metadata,
                    `${itemKey}_atlas_sprite_sheet_metadata.json`,
                    `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                  );
                  if (metadataIpfsResult) {
                    importItemMetadataCid = metadataIpfsResult.cid;
                    logger.info(`[staging] Atlas metadata pinned to IPFS – CID: ${importItemMetadataCid}`);
                    try {
                      await createPinRecord({
                        cid: importItemMetadataCid,
                        resourceType: 'atlas-metadata',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create atlas-metadata pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to add atlas metadata to IPFS:', ipfsError.message);
                }

                stagingAtlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
                if (stagingAtlasDoc) {
                  if (stagingAtlasDoc.fileId) await File.findByIdAndDelete(stagingAtlasDoc.fileId);
                  stagingAtlasDoc.fileId = stagingFileDoc._id;
                  stagingAtlasDoc.cid = importItemCid;
                  stagingAtlasDoc.metadata = metadata;
                  await stagingAtlasDoc.save();
                } else {
                  stagingAtlasDoc = await new AtlasSpriteSheet({
                    fileId: stagingFileDoc._id,
                    cid: importItemCid,
                    metadata,
                  }).save();
                }

                stagingData.render.cid = importItemCid;
                stagingData.render.metadataCid = importItemMetadataCid;

                stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);
                try {
                  const ipfsDataResult = await IpfsClient.addJsonToIpfs(
                    stagingData,
                    `${itemKey}_data.json`,
                    `/object-layer/${itemKey}/${itemKey}_data.json`,
                  );
                  if (ipfsDataResult) {
                    stagingCid = ipfsDataResult.cid;
                    logger.info(`[staging] Data JSON pinned to IPFS – CID: ${stagingCid}`);
                    try {
                      await createPinRecord({
                        cid: stagingCid,
                        resourceType: 'object-layer-data',
                        mfsPath: `/object-layer/${itemKey}/${itemKey}_data.json`,
                        options: { host, path },
                      });
                    } catch (prErr) {
                      logger.warn('[staging] Failed to create data pin record:', prErr.message);
                    }
                  }
                } catch (ipfsError) {
                  logger.warn('[staging] Failed to pin data JSON to IPFS:', ipfsError.message);
                }

                cutoverReady = true;
                logger.info(`[staging] Item '${itemKey}' fully staged in memory, ready for creation`);
              } catch (atlasError) {
                logger.error(`[staging] Failed for ${currentItemId}, no document created:`, atlasError);
              }

              if (cutoverReady) {
                const newRenderFrames = await ObjectLayerRenderFrames.create(objectLayerRenderFramesData);
                objectLayer = await ObjectLayer.create({
                  data: stagingData,
                  sha256: stagingSha256,
                  cid: stagingCid,
                  objectLayerRenderFramesId: newRenderFrames._id,
                  atlasSpriteSheetId: stagingAtlasDoc._id,
                });
                logger.info(`[cut-over] New ObjectLayer ${objectLayer._id} created with all CIDs populated`);
              } else {
                if (stagingFileDoc) await File.findByIdAndDelete(stagingFileDoc._id);
                logger.warn(`[cut-over] Staging failed for ${currentItemId}, no ObjectLayer created`);
                continue;
              }
            }

            // Reload final state to include CID and render updates
            const finalObjectLayer = await ObjectLayer.findById(objectLayer._id).populate('objectLayerRenderFramesId');
            console.log(finalObjectLayer.toObject());
          }
        }

        // ── Handle --import-types (batch by type) ────────────────────────
        if (options.importTypes) {
          /** @type {boolean} */
          const isImportAll = options.importTypes === 'all';

          /** @type {string[]} */
          const argItemTypes = isImportAll ? Object.keys(itemTypes) : options.importTypes.split(',');

          /**
           * Accumulated object layer data keyed by objectLayerId.
           * @type {Object<string, import('../src/projects/cyberia/object-layer.js').ObjectLayerData>}
           */
          const objectLayers = {};

          // When importing all types, pre-fetch existing item IDs so we can skip them entirely
          /** @type {Set<string>} */
          const existingItemIds = new Set();
          if (isImportAll) {
            const existingDocs = await ObjectLayer.find({}, { 'data.item.id': 1 }).lean();
            for (const doc of existingDocs) {
              if (doc.data?.item?.id) existingItemIds.add(doc.data.item.id);
            }
            if (existingItemIds.size > 0) {
              logger.info(`Skipping ${existingItemIds.size} existing item(s): ${[...existingItemIds].join(', ')}`);
            }
          }

          for (const argItemType of argItemTypes) {
            await pngDirectoryIteratorByObjectLayerType(
              argItemType,
              async ({ path: framePath, objectLayerType, objectLayerId, direction, frame }) => {
                if (
                  storage &&
                  !storage[`src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/08/0.png`]
                )
                  return;

                // Skip items that already exist in the database (bulk import only)
                if (isImportAll && existingItemIds.has(objectLayerId)) return;

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

                  // Write processed frames back to disk so WebP matches atlas
                  const srcBasePath = './src/client/public/cyberia/';
                  const publicBasePath = `./public/${host}${path}`;
                  await ObjectLayerEngine.writeStaticFrameAssets({
                    basePaths: [srcBasePath, publicBasePath],
                    itemType: objectLayerType,
                    itemId: objectLayerId,
                    objectLayerRenderFramesData,
                    objectLayerData,
                    cellPixelDim: 20,
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
              // Check if an ObjectLayer with the same item.id already exists (upsert by item ID)
              const existingOL = await ObjectLayer.findOne({ 'data.item.id': objectLayerId });
              let objectLayer;

              if (existingOL) {
                // ── Cut-over consistency: stage everything in memory before touching the live document ──
                logger.info(`ObjectLayer '${objectLayerId}' already exists (${existingOL._id}), staging update...`);

                // 1. Prepare staging data entirely in memory (no DB writes yet)
                const stagingData = JSON.parse(JSON.stringify(entry.data));
                if (!stagingData.render) stagingData.render = {};
                stagingData.render.cid = '';
                stagingData.render.metadataCid = '';

                // 2. Generate atlas, pin to IPFS, compute SHA-256 — all in memory
                let cutoverReady = false;
                let stagingFileDoc = null;
                let stagingAtlasDoc = null;
                let stagingCid = '';
                let stagingSha256 = '';
                try {
                  const itemKey = objectLayerId;

                  // Generate atlas from in-memory render frames data (plain object, no DB doc needed)
                  const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
                    entry.objectLayerRenderFramesData,
                    itemKey,
                    20,
                  );

                  stagingFileDoc = await new File({
                    name: `${itemKey}-atlas.png`,
                    data: buffer,
                    size: buffer.length,
                    mimetype: 'image/png',
                    md5: crypto.createHash('md5').update(buffer).digest('hex'),
                  }).save();

                  let importAtlasCid = '';
                  let importAtlasMetadataCid = '';
                  try {
                    const ipfsResult = await IpfsClient.addBufferToIpfs(
                      buffer,
                      `${itemKey}_atlas_sprite_sheet.png`,
                      `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                    );
                    if (ipfsResult) {
                      importAtlasCid = ipfsResult.cid;
                      logger.info(`[staging] Atlas pinned to IPFS – CID: ${importAtlasCid}`);
                      try {
                        await createPinRecord({
                          cid: importAtlasCid,
                          resourceType: 'atlas-sprite-sheet',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create atlas pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to add atlas to IPFS:', ipfsError.message);
                  }

                  try {
                    const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
                      metadata,
                      `${itemKey}_atlas_sprite_sheet_metadata.json`,
                      `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                    );
                    if (metadataIpfsResult) {
                      importAtlasMetadataCid = metadataIpfsResult.cid;
                      logger.info(`[staging] Atlas metadata pinned to IPFS – CID: ${importAtlasMetadataCid}`);
                      try {
                        await createPinRecord({
                          cid: importAtlasMetadataCid,
                          resourceType: 'atlas-metadata',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create atlas-metadata pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to add atlas metadata to IPFS:', ipfsError.message);
                  }

                  stagingAtlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
                  if (stagingAtlasDoc) {
                    if (stagingAtlasDoc.fileId) await File.findByIdAndDelete(stagingAtlasDoc.fileId);
                    stagingAtlasDoc.fileId = stagingFileDoc._id;
                    stagingAtlasDoc.cid = importAtlasCid;
                    stagingAtlasDoc.metadata = metadata;
                    await stagingAtlasDoc.save();
                  } else {
                    stagingAtlasDoc = await new AtlasSpriteSheet({
                      fileId: stagingFileDoc._id,
                      cid: importAtlasCid,
                      metadata,
                    }).save();
                  }

                  // Finalize staging data in memory with render CIDs
                  stagingData.render.cid = importAtlasCid;
                  stagingData.render.metadataCid = importAtlasMetadataCid;

                  // Pin data JSON to IPFS (compute final SHA-256 in memory)
                  stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);
                  try {
                    const ipfsDataResult = await IpfsClient.addJsonToIpfs(
                      stagingData,
                      `${itemKey}_data.json`,
                      `/object-layer/${itemKey}/${itemKey}_data.json`,
                    );
                    if (ipfsDataResult) {
                      stagingCid = ipfsDataResult.cid;
                      logger.info(`[staging] Data JSON pinned to IPFS – CID: ${stagingCid}`);
                      try {
                        await createPinRecord({
                          cid: stagingCid,
                          resourceType: 'object-layer-data',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_data.json`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create data pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to pin data JSON to IPFS:', ipfsError.message);
                  }

                  cutoverReady = true;
                  logger.info(`[staging] Item '${itemKey}' fully staged in memory, ready for cut-over`);
                } catch (atlasError) {
                  logger.error(`[staging] Failed for ${objectLayerId}, live document untouched:`, atlasError);
                }

                // 3. Atomic cut-over: create new RenderFrames, swap live ObjectLayer in a single update
                if (cutoverReady) {
                  const oldRenderFramesId = existingOL.objectLayerRenderFramesId;
                  const newRenderFrames = await ObjectLayerRenderFrames.create(entry.objectLayerRenderFramesData);

                  await ObjectLayer.findByIdAndUpdate(existingOL._id, {
                    data: stagingData,
                    sha256: stagingSha256,
                    cid: stagingCid,
                    objectLayerRenderFramesId: newRenderFrames._id,
                    atlasSpriteSheetId: stagingAtlasDoc._id,
                  });

                  if (oldRenderFramesId) {
                    await ObjectLayerRenderFrames.findByIdAndDelete(oldRenderFramesId);
                  }
                  logger.info(`[cut-over] Live document ${existingOL._id} updated atomically`);
                } else {
                  if (stagingFileDoc) await File.findByIdAndDelete(stagingFileDoc._id);
                  logger.warn(`[cut-over] Staging rolled back for ${objectLayerId}, live document preserved`);
                }

                objectLayer = await ObjectLayer.findById(existingOL._id);
              } else {
                // ── New item: stage everything before creating (same cut-over pattern) ──
                logger.info(`ObjectLayer '${objectLayerId}' is new, staging creation...`);

                const itemKey = objectLayerId;
                const stagingData = JSON.parse(JSON.stringify(entry.data));
                if (!stagingData.render) stagingData.render = {};
                stagingData.render.cid = '';
                stagingData.render.metadataCid = '';

                let cutoverReady = false;
                let stagingFileDoc = null;
                let stagingAtlasDoc = null;
                let stagingCid = '';
                let stagingSha256 = '';
                try {
                  const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
                    entry.objectLayerRenderFramesData,
                    itemKey,
                    20,
                  );

                  stagingFileDoc = await new File({
                    name: `${itemKey}-atlas.png`,
                    data: buffer,
                    size: buffer.length,
                    mimetype: 'image/png',
                    md5: crypto.createHash('md5').update(buffer).digest('hex'),
                  }).save();

                  let importAtlasCid = '';
                  let importAtlasMetadataCid = '';
                  try {
                    const ipfsResult = await IpfsClient.addBufferToIpfs(
                      buffer,
                      `${itemKey}_atlas_sprite_sheet.png`,
                      `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                    );
                    if (ipfsResult) {
                      importAtlasCid = ipfsResult.cid;
                      logger.info(`[staging] Atlas pinned to IPFS – CID: ${importAtlasCid}`);
                      try {
                        await createPinRecord({
                          cid: importAtlasCid,
                          resourceType: 'atlas-sprite-sheet',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create atlas pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to add atlas to IPFS:', ipfsError.message);
                  }

                  try {
                    const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
                      metadata,
                      `${itemKey}_atlas_sprite_sheet_metadata.json`,
                      `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                    );
                    if (metadataIpfsResult) {
                      importAtlasMetadataCid = metadataIpfsResult.cid;
                      logger.info(`[staging] Atlas metadata pinned to IPFS – CID: ${importAtlasMetadataCid}`);
                      try {
                        await createPinRecord({
                          cid: importAtlasMetadataCid,
                          resourceType: 'atlas-metadata',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create atlas-metadata pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to add atlas metadata to IPFS:', ipfsError.message);
                  }

                  stagingAtlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });
                  if (stagingAtlasDoc) {
                    if (stagingAtlasDoc.fileId) await File.findByIdAndDelete(stagingAtlasDoc.fileId);
                    stagingAtlasDoc.fileId = stagingFileDoc._id;
                    stagingAtlasDoc.cid = importAtlasCid;
                    stagingAtlasDoc.metadata = metadata;
                    await stagingAtlasDoc.save();
                  } else {
                    stagingAtlasDoc = await new AtlasSpriteSheet({
                      fileId: stagingFileDoc._id,
                      cid: importAtlasCid,
                      metadata,
                    }).save();
                  }

                  stagingData.render.cid = importAtlasCid;
                  stagingData.render.metadataCid = importAtlasMetadataCid;

                  stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);
                  try {
                    const ipfsDataResult = await IpfsClient.addJsonToIpfs(
                      stagingData,
                      `${itemKey}_data.json`,
                      `/object-layer/${itemKey}/${itemKey}_data.json`,
                    );
                    if (ipfsDataResult) {
                      stagingCid = ipfsDataResult.cid;
                      logger.info(`[staging] Data JSON pinned to IPFS – CID: ${stagingCid}`);
                      try {
                        await createPinRecord({
                          cid: stagingCid,
                          resourceType: 'object-layer-data',
                          mfsPath: `/object-layer/${itemKey}/${itemKey}_data.json`,
                          options: { host, path },
                        });
                      } catch (prErr) {
                        logger.warn('[staging] Failed to create data pin record:', prErr.message);
                      }
                    }
                  } catch (ipfsError) {
                    logger.warn('[staging] Failed to pin data JSON to IPFS:', ipfsError.message);
                  }

                  cutoverReady = true;
                  logger.info(`[staging] Item '${itemKey}' fully staged in memory, ready for creation`);
                } catch (atlasError) {
                  logger.error(`[staging] Failed for ${objectLayerId}, no document created:`, atlasError);
                }

                if (cutoverReady) {
                  const newRenderFrames = await ObjectLayerRenderFrames.create(entry.objectLayerRenderFramesData);
                  objectLayer = await ObjectLayer.create({
                    data: stagingData,
                    sha256: stagingSha256,
                    cid: stagingCid,
                    objectLayerRenderFramesId: newRenderFrames._id,
                    atlasSpriteSheetId: stagingAtlasDoc._id,
                  });
                  logger.info(`[cut-over] New ObjectLayer ${objectLayer._id} created with all CIDs populated`);
                } else {
                  if (stagingFileDoc) await File.findByIdAndDelete(stagingFileDoc._id);
                  logger.warn(`[cut-over] Staging failed for ${objectLayerId}, no ObjectLayer created`);
                  continue;
                }
              }

              // Reload final state to include CID and render updates
              const finalObjectLayer = await ObjectLayer.findById((objectLayer._id || objectLayer).toString()).populate(
                'objectLayerRenderFramesId',
              );
              console.log(finalObjectLayer.toObject());
            } else {
              // --import all: skip items that already exist in the database
              if (existingItemIds.has(objectLayerId)) continue;

              // --import all: create documents without atlas generation
              const existingOL = await ObjectLayer.findOne({ 'data.item.id': objectLayerId });
              let objectLayer;

              if (existingOL) {
                logger.info(
                  `ObjectLayer '${objectLayerId}' already exists (${existingOL._id}), staging update (atlas skipped)...`,
                );

                // ── In-memory staging (no atlas) ──────────────────────
                const stagingData = JSON.parse(JSON.stringify(entry.data));
                if (!stagingData.render) stagingData.render = {};
                stagingData.render.cid = '';
                stagingData.render.metadataCid = '';
                const stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);

                // Atomic cut-over: create new RenderFrames, swap live doc, delete old
                const newRenderFrames = await ObjectLayerRenderFrames.create(entry.objectLayerRenderFramesData);
                const oldRenderFramesId = existingOL.objectLayerRenderFramesId;

                await ObjectLayer.findByIdAndUpdate(existingOL._id, {
                  data: stagingData,
                  sha256: stagingSha256,
                  objectLayerRenderFramesId: newRenderFrames._id,
                });

                if (oldRenderFramesId) {
                  await ObjectLayerRenderFrames.findByIdAndDelete(oldRenderFramesId);
                }

                objectLayer = await ObjectLayer.findById(existingOL._id);
                logger.info(`[cut-over] Live document ${existingOL._id} updated atomically (atlas skipped)`);
              } else {
                // New item: create with sha256 populated (no atlas for bulk import)
                const stagingData = JSON.parse(JSON.stringify(entry.data));
                if (!stagingData.render) stagingData.render = {};
                stagingData.render.cid = '';
                stagingData.render.metadataCid = '';
                const stagingSha256 = ObjectLayerEngine.computeSha256(stagingData);

                const newRenderFrames = await ObjectLayerRenderFrames.create(entry.objectLayerRenderFramesData);
                objectLayer = await ObjectLayer.create({
                  data: stagingData,
                  sha256: stagingSha256,
                  objectLayerRenderFramesId: newRenderFrames._id,
                });
              }

              logger.info(
                `ObjectLayer ${existingOL ? 'updated' : 'created'} (atlas skipped for bulk import): ${objectLayerId}`,
              );
              console.log(objectLayer.toObject ? objectLayer.toObject() : objectLayer);
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
          const objectLayerFrameDirections = getKeyframeDirectionsByCode(direction);
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
              `Frame index ${frameIndexNum} out of range. Available frames: 0-${
                frames.length - 1
              } for direction ${objectLayerFrameDirection}`,
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

          // Pin atlas PNG to IPFS
          let toAtlasCid = '';
          let toAtlasMetadataCid = '';
          try {
            const ipfsResult = await IpfsClient.addBufferToIpfs(
              buffer,
              `${itemKey}_atlas_sprite_sheet.png`,
              `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
            );
            if (ipfsResult) {
              toAtlasCid = ipfsResult.cid;
              logger.info(`Atlas sprite sheet pinned to IPFS – CID: ${toAtlasCid}`);
              try {
                await createPinRecord({
                  cid: toAtlasCid,
                  resourceType: 'atlas-sprite-sheet',
                  mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
                });
              } catch (e) {
                logger.warn('Failed to create pin record for atlas sprite sheet:', e.message);
              }
            }
          } catch (ipfsError) {
            logger.warn('Failed to add atlas sprite sheet to IPFS:', ipfsError.message);
          }

          // Pin atlas metadata JSON to IPFS (fast-json-stable-stringify)
          try {
            const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
              metadata,
              `${itemKey}_atlas_sprite_sheet_metadata.json`,
              `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
            );
            if (metadataIpfsResult) {
              toAtlasMetadataCid = metadataIpfsResult.cid;
              logger.info(`Atlas metadata pinned to IPFS – CID: ${toAtlasMetadataCid}`);
              try {
                await createPinRecord({
                  cid: toAtlasMetadataCid,
                  resourceType: 'atlas-metadata',
                  mfsPath: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
                });
              } catch (e) {
                logger.warn('Failed to create pin record for atlas metadata:', e.message);
              }
            }
          } catch (ipfsError) {
            logger.warn('Failed to add atlas metadata to IPFS:', ipfsError.message);
          }

          // Check if atlas sprite sheet already exists
          let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey });

          if (atlasDoc) {
            // Update existing – remove old File to prevent orphans
            if (atlasDoc.fileId) await File.findByIdAndDelete(atlasDoc.fileId);
            atlasDoc.fileId = fileDoc._id;
            atlasDoc.cid = toAtlasCid;
            atlasDoc.metadata = metadata;
            await atlasDoc.save();
            logger.info(`Updated existing AtlasSpriteSheet document: ${atlasDoc._id}`);
          } else {
            // Create new
            atlasDoc = await new AtlasSpriteSheet({
              fileId: fileDoc._id,
              cid: toAtlasCid,
              metadata,
            }).save();
            logger.info(`Created new AtlasSpriteSheet document: ${atlasDoc._id}`);
          }

          // Update ObjectLayer with reference to atlas sprite sheet and render CIDs
          objectLayer.atlasSpriteSheetId = atlasDoc._id;
          if (!objectLayer.data.render) objectLayer.data.render = {};
          objectLayer.data.render.cid = toAtlasCid;
          objectLayer.data.render.metadataCid = toAtlasMetadataCid;
          objectLayer.markModified('data.render');
          await objectLayer.save();

          // Compute final SHA-256 and pin object layer data JSON to IPFS
          await ObjectLayerEngine.computeAndSaveFinalSha256({
            objectLayer,
            ipfsClient: IpfsClient,
            createPinRecord,
          });

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
            let atlasMetadataCid = '';
            try {
              const ipfsResult = await IpfsClient.addBufferToIpfs(
                buffer,
                `${atlasItemKey}_atlas_sprite_sheet.png`,
                `/object-layer/${atlasItemKey}/${atlasItemKey}_atlas_sprite_sheet.png`,
              );
              if (ipfsResult) {
                atlasCid = ipfsResult.cid;
                logger.info(`Atlas sprite sheet pinned to IPFS – CID: ${atlasCid}`);
                try {
                  await createPinRecord({
                    cid: atlasCid,
                    resourceType: 'atlas-sprite-sheet',
                    mfsPath: `/object-layer/${atlasItemKey}/${atlasItemKey}_atlas_sprite_sheet.png`,
                    options: { host, path },
                  });
                } catch (e) {
                  logger.warn('Failed to create pin record for atlas sprite sheet:', e.message);
                }
              }
            } catch (ipfsError) {
              logger.warn('Failed to add atlas sprite sheet to IPFS:', ipfsError.message);
            }

            // Pin atlas metadata JSON to IPFS (fast-json-stable-stringify)
            try {
              const metadataIpfsResult = await IpfsClient.addJsonToIpfs(
                metadata,
                `${atlasItemKey}_atlas_sprite_sheet_metadata.json`,
                `/object-layer/${atlasItemKey}/${atlasItemKey}_atlas_sprite_sheet_metadata.json`,
              );
              if (metadataIpfsResult) {
                atlasMetadataCid = metadataIpfsResult.cid;
                logger.info(`Atlas metadata pinned to IPFS – CID: ${atlasMetadataCid}`);
                try {
                  await createPinRecord({
                    cid: atlasMetadataCid,
                    resourceType: 'atlas-metadata',
                    mfsPath: `/object-layer/${atlasItemKey}/${atlasItemKey}_atlas_sprite_sheet_metadata.json`,
                    options: { host, path },
                  });
                } catch (e) {
                  logger.warn('Failed to create pin record for atlas metadata:', e.message);
                }
              }
            } catch (ipfsError) {
              logger.warn('Failed to add atlas metadata to IPFS:', ipfsError.message);
            }

            // Upsert AtlasSpriteSheet document (with CID)
            let atlasDoc = await AtlasSpriteSheet.findOne({ 'metadata.itemKey': atlasItemKey });
            if (atlasDoc) {
              if (atlasDoc.fileId) await File.findByIdAndDelete(atlasDoc.fileId);
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

            // Link atlas to ObjectLayer and set data.render.cid + data.render.metadataCid
            populatedObjectLayer.atlasSpriteSheetId = atlasDoc._id;
            if (!populatedObjectLayer.data.render) populatedObjectLayer.data.render = {};
            populatedObjectLayer.data.render.cid = atlasCid;
            populatedObjectLayer.data.render.metadataCid = atlasMetadataCid;
            populatedObjectLayer.markModified('data.render');
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

        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      },
    )
    .description('Object layer management');

  // ── instance: Cyberia instance backup / restore ─────────────────────────
  program
    .command('instance [instance-code]')
    .option('--export [path]', 'Export instance and related documents to a backup directory')
    .option('--import [path]', 'Import instance and related documents from a backup directory (preserveUUID, upsert)')
    .option(
      '--conf',
      'When used with --export or --import, only process cyberia-instance.json and cyberia-instance-conf.json',
    )
    .option('--drop', 'Drop all documents associated with the instance code before importing or as a standalone action')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .option('--publish-build', 'Build instance backup directory with all related maps, entities and object layers')
    .option('--publish-remove', 'Remove published instance from underpostnet/cyberia-instances repository')
    .option('--publish', 'Publish instance in underpostnet/cyberia-instances repository')
    .option('--revert', 'Revert instance to previous commit in underpostnet/cyberia-instances repository')
    .option(
      '--from-n-commit <n>',
      'Number of latest engine commits to use for the publish commit message (default: 1).',
    )
    .description('Export/import a Cyberia instance with all related maps, entities and object layers')
    .action(async (instanceCode, options = {}) => {
      if (options.revert) {
        shellExec(`cd /home/dd/cyberia-instances && underpost cmt . reset && underpost run clean .`);
        shellExec(`cd /home/dd/engine/cyberia-server && underpost cmt . reset && underpost run clean .`);
        shellExec(`cd /home/dd/engine/cyberia-client && underpost cmt . reset && underpost run clean .`);
        return;
      }
      if (!instanceCode) {
        instanceCode = 'amethyst-strata-expansion,FOREST';
        logger.warn(`No instance code provided, defaulting to: ${instanceCode}`);
      }

      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const deployDevEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(deployDevEnvPath)) {
          dotenv.config({ path: deployDevEnvPath, override: true });
        }
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }

      if (options.publish || options.publishBuild || options.publishRemove) {
        if (options.publishBuild) {
          if (!fs.existsSync('/home/dd/cyberia-instances')) {
            shellExec('cd /home/dd && underpost clone underpostnet/cyberia-instances');
          } else {
            shellExec(`underpost run clean /home/dd/cyberia-instances`);
            shellExec(`cd /home/dd/cyberia-instances && underpost pull . underpostnet/cyberia-instances`, {
              silentOnError: true,
            });
          }

          fs.mkdirpSync(`/home/dd/cyberia-instances/conf/dd-cyberia`);
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.server.dev.dev.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/conf.server.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.client.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/conf.client.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.cron.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/conf.cron.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.ssr.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/conf.ssr.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.volume.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/conf.volume.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/package.json`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/package.json`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/docker-compose/cyberia/compose.env`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/.env.production`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/docker-compose/cyberia/compose.env`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/.env.development`,
          );
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/docker-compose/cyberia/compose.env`,
            `/home/dd/cyberia-instances/conf/dd-cyberia/.env.test`,
          );

          fs.mkdirpSync(`/home/dd/cyberia-instances/deployments`);
          fs.copySync(`./src/runtime/engine-cyberia`, `/home/dd/cyberia-instances/deployments/engine-cyberia`);
          fs.copySync(
            `./manifests/deployment/dd-cyberia-development/.`,
            `/home/dd/cyberia-instances/deployments/engine-cyberia/.`,
          );
          fs.copySync(`./src/runtime/cyberia-client`, `/home/dd/cyberia-instances/deployments/cyberia-client`);
          fs.copySync(
            `./engine-private/conf/dd-cyberia/instances/mmo-client/build/development/.`,
            `/home/dd/cyberia-instances/deployments/cyberia-client/.`,
          );
          fs.copySync(`./src/runtime/cyberia-server`, `/home/dd/cyberia-instances/deployments/cyberia-server`);
          fs.copySync(
            `./engine-private/conf/dd-cyberia/instances/mmo-server/build/development/.`,
            `/home/dd/cyberia-instances/deployments/cyberia-server/.`,
          );
          fs.removeSync(`/home/dd/cyberia-instances/public/cyberia`);
          fs.mkdirpSync(`/home/dd/cyberia-instances/public/cyberia`);
          for (const assetPath of Object.keys(
            JSON.parse(fs.readFileSync(`./engine-private/conf/dd-cyberia/storage.engine-cyberia.json`, 'utf-8')),
          )) {
            const relativePath = assetPath.replace(/^src\/client\/public\/cyberia\//, '');
            const targetPath = `/home/dd/cyberia-instances/public/cyberia/${relativePath}`;
            fs.mkdirpSync(nodePath.dirname(targetPath));
            logger.info(`Copying asset: ${assetPath} → ${targetPath}`);
            fs.copySync(`./${assetPath}`, targetPath);
          }

          // Copy default-items asset folders (src/client/public/cyberia/assets/<type>/<id>/ → public/cyberia/assets/<type>/<id>/)
          for (const entry of DefaultCyberiaItems) {
            const { id, type } = entry.item;
            const srcDir = `src/client/public/cyberia/assets/${type}/${id}`;
            const targetDir = `/home/dd/cyberia-instances/public/cyberia/assets/${type}/${id}`;
            if (fs.existsSync(srcDir)) {
              fs.mkdirpSync(nodePath.dirname(targetDir));
              logger.info(`Copying default-item asset: ${srcDir} → ${targetDir}`);
              fs.copySync(srcDir, targetDir);
            } else {
              logger.warn(`Default-item asset directory not found, skipping: ${srcDir}`);
            }
          }

          fs.mkdirpSync(`/home/dd/cyberia-instances/instances`);
          fs.mkdirpSync(`/home/dd/cyberia-instances/sagas`);
          for (const _instanceCode of instanceCode.split(',')) {
            fs.copySync(
              `./engine-private/cyberia-instances/${_instanceCode}`,
              `/home/dd/cyberia-instances/instances/${_instanceCode}`,
            );
            if (fs.existsSync(`./engine-private/cyberia-sagas/${_instanceCode}.json`))
              fs.copyFileSync(
                `./engine-private/cyberia-sagas/${_instanceCode}.json`,
                `/home/dd/cyberia-instances/sagas/${_instanceCode}.json`,
              );
          }
          if (fs.existsSync('./engine-private/conf/dd-cyberia/conf.instances.json'))
            fs.copySync(
              './engine-private/conf/dd-cyberia/conf.instances.json',
              '/home/dd/cyberia-instances/conf/dd-cyberia/conf.instances.json',
            );

          const fromN = parseInt(options.fromNCommit) > 0 ? parseInt(options.fromNCommit) : 1;
          const publishMessage =
            shellExec(`node bin cmt --changelog-msg --from-n-commit ${fromN} --changelog-no-hash`, {
              stdout: true,
              silent: true,
            }).trim() || `Update instance ${instanceCode}`;
          const instanceMessage = `Update build and deployment manifests`;
          shellExec(
            `cd /home/dd/cyberia-instances \
          && git add . \
          && git commit -m "${publishMessage.replace(/"/g, '\\"')}"`,
            {
              silentOnError: true,
            },
          );
          shellExec(
            `cd /home/dd/engine/cyberia-server \
          && git add . \
          && git commit -m "${instanceMessage}"`,
            {
              silentOnError: true,
            },
          );
          shellExec(
            `cd /home/dd/engine/cyberia-client \
          && git add . \
          && git commit -m "${instanceMessage}"`,
            {
              silentOnError: true,
            },
          );
          return;
        } else if (options.publishRemove) {
          shellExec(`rm -rf /home/dd/cyberia-instances/instances/${instanceCode}`);
          shellExec(`rm -rf /home/dd/cyberia-instances/sagas/${instanceCode}.json`);
          return;
        }
        shellExec(`cd /home/dd/cyberia-instances && underpost push . underpostnet/cyberia-instances`);
        return;
      }

      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('instance env', { env: options.envPath, deployId, host, path, db });

      await DataBaseProviderService.load({
        apis: [
          'cyberia-instance',
          'cyberia-instance-conf',
          'cyberia-dialogue',
          'cyberia-map',
          'cyberia-entity',
          'cyberia-quest',
          'cyberia-action',
          'cyberia-skill',
          'cyberia-entity-type-default',
          'cyberia-saga',
          'object-layer',
          'object-layer-render-frames',
          'atlas-sprite-sheet',
          'file',
          'ipfs',
        ],
        host,
        path,
        db,
      });

      const CyberiaInstance = DataBaseProviderService.getModel('cyberia-instance', { host, path });
      const CyberiaInstanceConf = DataBaseProviderService.getModel('cyberia-instance-conf', { host, path });
      const CyberiaDialogue = DataBaseProviderService.getModel('cyberia-dialogue', { host, path });
      const CyberiaMap = DataBaseProviderService.getModel('cyberia-map', { host, path });
      const CyberiaQuest = DataBaseProviderService.getModel('cyberia-quest', { host, path });
      const CyberiaAction = DataBaseProviderService.getModel('cyberia-action', { host, path });
      const CyberiaSkill = DataBaseProviderService.getModel('cyberia-skill', { host, path });
      const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('cyberia-entity-type-default', { host, path });
      const CyberiaSaga = DataBaseProviderService.getModel('cyberia-saga', { host, path });
      const ObjectLayer = DataBaseProviderService.getModel('object-layer', { host, path });
      const ObjectLayerRenderFrames = DataBaseProviderService.getModel('object-layer-render-frames', { host, path });
      const AtlasSpriteSheet = DataBaseProviderService.getModel('atlas-sprite-sheet', { host, path });
      const File = DataBaseProviderService.getModel('file', { host, path });
      const Ipfs = DataBaseProviderService.getModel('ipfs', { host, path });

      const toBuffer = (value) => {
        if (!value) return null;
        if (Buffer.isBuffer(value)) return value;
        if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
        if (value.buffer) return Buffer.from(value.buffer);
        return Buffer.from(value);
      };

      const getCanonicalIpfsPaths = (itemKey) => ({
        objectLayerData: `/object-layer/${itemKey}/${itemKey}_data.json`,
        atlasSpriteSheet: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet.png`,
        atlasMetadata: `/object-layer/${itemKey}/${itemKey}_atlas_sprite_sheet_metadata.json`,
      });

      // Canonical pins now carry a single `mfsPath`; `mfsPaths` (plural) is only read
      // for backward compatibility with older backups that consolidated shared CIDs.
      const collectMfsPaths = (doc = {}) => {
        const paths = new Set();
        if (doc.mfsPath) paths.add(doc.mfsPath);
        for (const p of doc.mfsPaths || []) {
          if (p) paths.add(p);
        }
        return [...paths];
      };

      const inferResourceType = (doc = {}) => {
        if (doc.resourceType) return doc.resourceType;
        for (const path of collectMfsPaths(doc)) {
          if (path.endsWith('_atlas_sprite_sheet.png')) return 'atlas-sprite-sheet';
          if (path.endsWith('_atlas_sprite_sheet_metadata.json')) return 'atlas-metadata';
          if (path.endsWith('_data.json')) return 'object-layer-data';
        }
        return null;
      };

      const findInstanceRelatedIpfsDoc = (ipfsDocs, { linkedCid, resourceType, mfsPath }) =>
        ipfsDocs.find(
          (doc) =>
            inferResourceType(doc) === resourceType &&
            linkedCid &&
            doc.cid === linkedCid &&
            collectMfsPaths(doc).includes(mfsPath),
        ) ||
        ipfsDocs.find((doc) => inferResourceType(doc) === resourceType && linkedCid && doc.cid === linkedCid) ||
        ipfsDocs.find((doc) => inferResourceType(doc) === resourceType && collectMfsPaths(doc).includes(mfsPath)) ||
        null;

      const upsertCanonicalPinEntry = (pinMap, { cid, resourceType, mfsPath = '' }) => {
        if (!cid || !resourceType) return;
        const nextPath = mfsPath || '';
        // mfsPath uniquely identifies an item-id asset; when absent, fall back to
        // cid+resourceType so path-less pins still dedupe.
        const key = nextPath || `${resourceType}:${cid}`;
        const existing = pinMap.get(key);
        if (!existing) {
          pinMap.set(key, { cid, resourceType, mfsPath: nextPath });
          return;
        }
        // A new CID for the same mfsPath overwrites the previous association (last write wins).
        existing.cid = cid;
        existing.resourceType = resourceType;
        if (nextPath) existing.mfsPath = nextPath;
      };

      const serialiseCanonicalPins = (pinMap) =>
        [...pinMap.values()].map((entry) => ({
          cid: entry.cid,
          resourceType: entry.resourceType,
          ...(entry.mfsPath ? { mfsPath: entry.mfsPath } : {}),
        }));

      // Bring the live Ipfs collection in line with the mfsPath-unique model: collapse
      // duplicate mfsPath rows (keeping the most recently updated association) then sync
      // indexes so the legacy {cid,resourceType} unique index is dropped and the new
      // partial unique index on mfsPath is built. Idempotent and safe to re-run.
      const reconcileIpfsRegistryIndexes = async () => {
        let removedDuplicates = 0;
        const duplicateGroups = await Ipfs.aggregate([
          { $match: { mfsPath: { $gt: '' } } },
          { $sort: { updatedAt: -1, _id: -1 } },
          { $group: { _id: '$mfsPath', keepId: { $first: '$_id' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
        ]);
        for (const group of duplicateGroups) {
          const staleIds = group.ids.filter((id) => String(id) !== String(group.keepId));
          if (staleIds.length) {
            const res = await Ipfs.deleteMany({ _id: { $in: staleIds } });
            removedDuplicates += res?.deletedCount || 0;
          }
        }
        try {
          await Ipfs.syncIndexes();
        } catch (err) {
          logger.warn(
            `IPFS registry index sync failed (mfsPath uniqueness may not be enforced): ${err?.message ?? err}`,
          );
        }
        if (removedDuplicates) {
          logger.info(
            `IPFS registry reconciled: removed ${removedDuplicates} duplicate mfsPath record(s), kept newest association per path`,
          );
        }
      };

      const rewriteImportedCidReferences = async ({ oldCid, newCid, resourceType }) => {
        if (!oldCid || !newCid || oldCid === newCid) return;

        if (resourceType === 'object-layer-data') {
          await ObjectLayer.updateMany({ cid: oldCid }, { $set: { cid: newCid } });
          return;
        }

        if (resourceType === 'atlas-sprite-sheet') {
          await AtlasSpriteSheet.updateMany({ cid: oldCid }, { $set: { cid: newCid } });
          await ObjectLayer.updateMany({ 'data.render.cid': oldCid }, { $set: { 'data.render.cid': newCid } });
          return;
        }

        if (resourceType === 'atlas-metadata') {
          await ObjectLayer.updateMany(
            { 'data.render.metadataCid': oldCid },
            { $set: { 'data.render.metadataCid': newCid } },
          );
        }
      };

      // ── EXPORT ──────────────────────────────────────────────────────
      if (options.export !== undefined) {
        const instance = await CyberiaInstance.findOne({ code: instanceCode }).lean();
        if (!instance) {
          logger.error(`CyberiaInstance with code "${instanceCode}" not found`);
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
        }

        const backupDir =
          typeof options.export === 'string' && options.export
            ? options.export
            : `./engine-private/cyberia-instances/${instanceCode}`;

        fs.ensureDirSync(backupDir);
        logger.info('Exporting instance', { code: instanceCode, backupDir });

        // Helper: export a File document to the files/ directory
        const exportFileDoc = async (fileId, fileKey) => {
          if (!fileId) return;
          const file = await File.findById(fileId).lean();
          if (!file) return;
          fs.ensureDirSync(`${backupDir}/files`);
          const fileExport = { ...file };
          // Handle both Node.js Buffer and BSON Binary types from .lean()
          if (fileExport.data) {
            const buf = Buffer.isBuffer(fileExport.data)
              ? fileExport.data
              : Buffer.from(fileExport.data.buffer || fileExport.data);
            fileExport.data = { $base64: buf.toString('base64') };
          }
          fs.writeJsonSync(`${backupDir}/files/${fileKey}.json`, fileExport, { spaces: 2 });
        };

        // 1. Save instance document + thumbnail
        fs.writeJsonSync(`${backupDir}/cyberia-instance.json`, instance, { spaces: 2 });
        if (!options.conf && instance.thumbnail) {
          await exportFileDoc(instance.thumbnail, `thumb-instance-${instanceCode}`);
        }
        logger.info('Exported CyberiaInstance', { code: instanceCode });

        // 1b. Export linked CyberiaInstanceConf (skillRules, equipmentRules, entityDefaults, etc.)
        // If no conf doc exists yet (instance created before auto-upsert logic), create one using
        // schema defaults — identical to the behaviour in CyberiaInstanceService.post().
        let instanceConf =
          (await CyberiaInstanceConf.findOne({ instanceCode }).lean()) ||
          (instance.conf ? await CyberiaInstanceConf.findById(instance.conf).lean() : null);
        if (!instanceConf) {
          logger.info('No CyberiaInstanceConf found — creating default', { instanceCode });
          const created = await CyberiaInstanceConf.findOneAndUpdate(
            { instanceCode },
            { $setOnInsert: { instanceCode } },
            { upsert: true, returnDocument: 'after' },
          );
          // Back-fill the instance.conf ref if it was missing
          if (created && !instance.conf) {
            await CyberiaInstance.findByIdAndUpdate(instance._id, { conf: created._id });
          }
          instanceConf = created?.toObject ? created.toObject() : created;
        }
        if (instanceConf) {
          // `.lean()` skips Mongoose schema defaults and older docs may predate
          // some fields, so backfill every CyberiaInstanceConfSchema field from
          // the canonical defaults before writing the backup.
          instanceConf = fillInstanceConfDefaults(instanceConf);
          fs.writeJsonSync(`${backupDir}/cyberia-instance-conf.json`, instanceConf, { spaces: 2 });
          logger.info('Exported CyberiaInstanceConf', { instanceCode });
        } else {
          logger.warn('Could not create or find CyberiaInstanceConf', { instanceCode });
        }

        if (options.conf) {
          logger.info('Instance export completed in --conf mode', {
            backupDir,
            exportedFiles: ['cyberia-instance.json', 'cyberia-instance-conf.json'],
          });
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          return;
        }

        // 2. Collect all map codes (instance maps + portal targets)
        const mapCodes = new Set(instance.cyberiaMapCodes || []);
        for (const portal of instance.portals || []) {
          if (portal.sourceMapCode) mapCodes.add(portal.sourceMapCode);
          if (portal.targetMapCode) mapCodes.add(portal.targetMapCode);
        }

        // 3. Export maps + thumbnails + Instance Map previews
        const maps = await CyberiaMap.find({ code: { $in: [...mapCodes] } }).lean();
        fs.ensureDirSync(`${backupDir}/maps`);
        for (const map of maps) {
          fs.writeJsonSync(`${backupDir}/maps/${map.code}.json`, map, { spaces: 2 });
          if (map.thumbnail) {
            await exportFileDoc(map.thumbnail, `thumb-map-${map.code}`);
          }
          if (map.preview) {
            await exportFileDoc(map.preview, `preview-map-${map.code}`);
          }
        }
        logger.info(`Exported ${maps.length} CyberiaMap document(s)`, { codes: maps.map((m) => m.code) });

        // 3b. Export quests + actions bound to THIS instance's maps (sourceMapCode
        //     in the instance's map codes) — only the content tied to this instance.
        //     Dialogue codes the actions reference are collected so they travel too.
        const actionDialogueCodes = new Set();
        const quests = await CyberiaQuest.find({ sourceMapCode: { $in: [...mapCodes] } }).lean();
        if (quests.length > 0) {
          fs.ensureDirSync(`${backupDir}/cyberia-quests`);
          for (const quest of quests) {
            fs.writeJsonSync(`${backupDir}/cyberia-quests/${encodeURIComponent(quest.code)}.json`, quest, {
              spaces: 2,
            });
          }
          logger.info(`Exported ${quests.length} CyberiaQuest document(s)`, { codes: quests.map((q) => q.code) });
        }

        const actions = await CyberiaAction.find({ sourceMapCode: { $in: [...mapCodes] } }).lean();
        if (actions.length > 0) {
          fs.ensureDirSync(`${backupDir}/cyberia-actions`);
          for (const action of actions) {
            fs.writeJsonSync(`${backupDir}/cyberia-actions/${encodeURIComponent(action.code)}.json`, action, {
              spaces: 2,
            });
            if (action.dialogCode) actionDialogueCodes.add(action.dialogCode);
            for (const qd of action.questDialogueCodes || []) {
              if (qd.dialogCode) actionDialogueCodes.add(qd.dialogCode);
            }
          }
          logger.info(`Exported ${actions.length} CyberiaAction document(s)`, { codes: actions.map((a) => a.code) });
        }

        // 4. Collect all objectLayerItemIds from map entities
        const objectLayerItemIds = new Set();
        for (const map of maps) {
          for (const entity of map.entities || []) {
            for (const itemId of entity.objectLayerItemIds || []) {
              objectLayerItemIds.add(itemId);
            }
          }
        }

        // 4b. Add instance-level itemIds ({ id, defaultPlayerInventory }).
        for (const entry of instance.itemIds || []) {
          const id = typeof entry === 'string' ? entry : entry?.id;
          if (id) objectLayerItemIds.add(id);
        }

        const contentItemIds = new Set(objectLayerItemIds);

        // 4c. Add all itemIds referenced by CyberiaInstanceConf (entityDefaults + skillConfig).
        //     This ensures liveItemIds, deadItemIds, dropItemIds, defaultObjectLayers and
        //     skill trigger items are included even if no map entity currently uses them.
        if (instanceConf) {
          for (const ed of instanceConf.entityDefaults || []) {
            for (const id of ed.liveItemIds || []) if (id) objectLayerItemIds.add(id);
            for (const id of ed.deadItemIds || []) if (id) objectLayerItemIds.add(id);
            for (const id of ed.dropItemIds || []) if (id) objectLayerItemIds.add(id);
            for (const slot of ed.defaultObjectLayers || []) {
              if (slot.itemId) objectLayerItemIds.add(slot.itemId);
            }
          }
          for (const sc of instanceConf.skillConfig || []) {
            if (sc.triggerItemId) objectLayerItemIds.add(sc.triggerItemId);
            for (const skill of sc.skills || []) {
              if (skill.summonedEntityItemId && !skill.summonedEntityItemId.startsWith('$')) {
                objectLayerItemIds.add(skill.summonedEntityItemId);
              }
            }
          }
        }

        // 4d. Export skills whose trigger item belongs to this instance (own model:
        //     CyberiaSkill, keyed by triggerItemId). Their summoned-entity items are
        //     added to the OL set so those atlases export too. Runs before the
        //     dialogue + OL queries so the summoned ids are included.
        if (objectLayerItemIds.size > 0) {
          const skills = await CyberiaSkill.find({ triggerItemId: { $in: [...objectLayerItemIds] } }).lean();
          if (skills.length > 0) {
            fs.ensureDirSync(`${backupDir}/cyberia-skills`);
            for (const skill of skills) {
              fs.writeJsonSync(`${backupDir}/cyberia-skills/${encodeURIComponent(skill.triggerItemId)}.json`, skill, {
                spaces: 2,
              });
              for (const def of skill.skills || []) {
                if (def.summonedEntityItemId && !def.summonedEntityItemId.startsWith('$')) {
                  objectLayerItemIds.add(def.summonedEntityItemId);
                }
              }
            }
            logger.info(`Exported ${skills.length} CyberiaSkill document(s)`, {
              triggerItemIds: skills.map((sk) => sk.triggerItemId),
            });
          }
        }

        // 4d-bis. Export entity-type defaults whose item ids belong to this
        //     instance's real content (own model: CyberiaEntityTypeDefault). A
        //     default is related when any of its live/dead/drop ids or default
        //     object-layer ids appears in contentItemIds — map/instance content
        //     only, NOT the canonical conf defaults every instance shares (which
        //     would spuriously drag in the global seed entity-type-defaults).
        //     Matched ids are folded back into objectLayerItemIds so the related
        //     atlases + dialogues export too.
        if (contentItemIds.size > 0) {
          const idsForMatch = [...contentItemIds];
          const entityDefaults = await CyberiaEntityTypeDefault.find({
            $or: [
              { liveItemIds: { $in: idsForMatch } },
              { deadItemIds: { $in: idsForMatch } },
              { dropItemIds: { $in: idsForMatch } },
              { 'defaultObjectLayers.itemId': { $in: idsForMatch } },
            ],
          }).lean();
          if (entityDefaults.length > 0) {
            fs.ensureDirSync(`${backupDir}/cyberia-entity-type-defaults`);
            for (const ed of entityDefaults) {
              fs.writeJsonSync(`${backupDir}/cyberia-entity-type-defaults/${ed._id}.json`, ed, { spaces: 2 });
              for (const id of ed.liveItemIds || []) if (id) objectLayerItemIds.add(id);
              for (const id of ed.deadItemIds || []) if (id) objectLayerItemIds.add(id);
              for (const id of ed.dropItemIds || []) if (id) objectLayerItemIds.add(id);
              for (const slot of ed.defaultObjectLayers || []) if (slot.itemId) objectLayerItemIds.add(slot.itemId);
            }
            logger.info(`Exported ${entityDefaults.length} CyberiaEntityTypeDefault document(s)`, {
              entityTypes: entityDefaults.map((ed) => ed.entityType),
            });
          }
        }

        // 4e. Export sagas related to this instance. A saga is considered related
        //     when its code matches the instance code (direct namespace match), or
        //     when its mapCodes or itemIds overlap with the instance's data.
        //     At this point objectLayerItemIds contains all map-entity, instance-level,
        //     conf-default, and skill-summoned item IDs — giving the broadest possible
        //     match surface for saga discovery.
        const sagaCodeMatch = instanceCode ? await CyberiaSaga.find({ code: instanceCode }).lean() : [];
        // Disabling overlaps queries for now because they can be very expensive and are not strictly necessary for a backup.
        const sagaMapOverlap = true
          ? []
          : mapCodes.size > 0
            ? await CyberiaSaga.find({ mapCodes: { $in: [...mapCodes] } }).lean()
            : [];
        const sagaItemOverlap = true
          ? []
          : objectLayerItemIds.size > 0
            ? await CyberiaSaga.find({ itemIds: { $in: [...objectLayerItemIds] } }).lean()
            : [];
        const allSagas = [
          ...new Map(
            [...sagaCodeMatch, ...sagaMapOverlap, ...sagaItemOverlap].map((s) => [s._id.toString(), s]),
          ).values(),
        ];
        if (allSagas.length > 0) {
          fs.ensureDirSync(`${backupDir}/cyberia-sagas`);
          for (const saga of allSagas) {
            fs.writeJsonSync(`${backupDir}/cyberia-sagas/${encodeURIComponent(saga.code)}.json`, saga, { spaces: 2 });
          }
          logger.info(`Exported ${allSagas.length} CyberiaSaga document(s)`, { codes: allSagas.map((s) => s.code) });
        }

        // 4f. Export dialogues for all relevant object-layer items (codes follow the
        //     pattern "default-<itemId>") plus the dialogue codes the instance's
        //     actions reference. If an item has no dialogue docs yet but ships with
        //     DefaultCyberiaDialogues, seed those defaults into Mongo first.
        if (objectLayerItemIds.size > 0 || actionDialogueCodes.size > 0) {
          const requestedItemIds = [...objectLayerItemIds];
          const requestedCodes = [
            ...new Set([...requestedItemIds.map((id) => `default-${id}`), ...actionDialogueCodes]),
          ];
          const dialogueDocs = await CyberiaDialogue.find({ code: { $in: requestedCodes } })
            .sort({ code: 1, order: 1 })
            .lean();
          if (dialogueDocs.length > 0) {
            fs.ensureDirSync(`${backupDir}/cyberia-dialogues`);
            const dialoguesByCode = new Map();

            for (const dialogue of dialogueDocs) {
              if (!dialoguesByCode.has(dialogue.code)) {
                dialoguesByCode.set(dialogue.code, []);
              }
              dialoguesByCode.get(dialogue.code).push(dialogue);
            }

            for (const [code, dialogues] of dialoguesByCode.entries()) {
              fs.writeJsonSync(`${backupDir}/cyberia-dialogues/${encodeURIComponent(code)}.json`, dialogues, {
                spaces: 2,
              });
            }

            logger.info(`Exported ${dialogueDocs.length} CyberiaDialogue document(s)`, {
              codes: [...dialoguesByCode.keys()],
            });
          }
        }

        // 5. Export object layers with related render frames, atlas, files, and IPFS records
        if (objectLayerItemIds.size > 0) {
          const objectLayers = await ObjectLayer.find({
            'data.item.id': { $in: [...objectLayerItemIds] },
          }).lean();

          fs.ensureDirSync(`${backupDir}/object-layers`);
          fs.ensureDirSync(`${backupDir}/render-frames`);
          fs.ensureDirSync(`${backupDir}/atlas-sprite-sheets`);
          fs.ensureDirSync(`${backupDir}/ipfs`);
          fs.ensureDirSync(`${backupDir}/ipfs/content`);

          const canonicalPins = new Map();
          const expectedObjectLayerIpfsRefs = [];
          const ipfsPayloadFailures = [];
          let ipfsPayloadExportCount = 0;
          let ipfsPayloadAliasCount = 0;

          const writeBackupPayload = (cid, payloadBuffer) => {
            if (!cid) return false;
            const payloadPath = `${backupDir}/ipfs/content/${cid}.bin`;
            if (fs.existsSync(payloadPath)) return false;
            fs.writeFileSync(payloadPath, payloadBuffer);
            ipfsPayloadExportCount++;
            return true;
          };

          const writeBackupPayloadAlias = ({ canonicalCid, linkedCid, payloadBuffer }) => {
            if (!linkedCid || linkedCid === canonicalCid) return;
            if (writeBackupPayload(linkedCid, payloadBuffer)) {
              ipfsPayloadAliasCount++;
            }
          };

          const exportCanonicalPayload = async ({ payloadBuffer, resourceType, mfsPath, filename, itemKey }) => {
            const hashResult = await IpfsClient.hashBufferForIpfs(payloadBuffer, filename);
            if (!hashResult?.cid) {
              ipfsPayloadFailures.push({ itemKey, resourceType, mfsPath, reason: 'Failed to hash payload via Kubo' });
              return null;
            }

            writeBackupPayload(hashResult.cid, payloadBuffer);
            return hashResult.cid;
          };

          for (const ol of objectLayers) {
            const itemKey = ol.data?.item?.id || ol._id.toString();
            const itemPaths = getCanonicalIpfsPaths(itemKey);
            const objectLayerExport = newInstance(ol);

            if (!objectLayerExport.data.render) {
              objectLayerExport.data.render = {};
            }

            // Export ObjectLayerRenderFrames
            if (ol.objectLayerRenderFramesId) {
              const rf = await ObjectLayerRenderFrames.findById(ol.objectLayerRenderFramesId).lean();
              if (rf) {
                fs.writeJsonSync(`${backupDir}/render-frames/${itemKey}.json`, rf, { spaces: 2 });
              }
            }

            const atlas =
              (ol.atlasSpriteSheetId ? await AtlasSpriteSheet.findById(ol.atlasSpriteSheetId).lean() : null) ||
              (await AtlasSpriteSheet.findOne({ 'metadata.itemKey': itemKey }).lean());
            if (atlas) {
              const atlasExport = newInstance(atlas);
              objectLayerExport.atlasSpriteSheetId = atlas._id;
              if (atlas.fileId) {
                await exportFileDoc(atlas.fileId, `atlas-${itemKey}`);
              }

              const atlasFile = atlas.fileId ? await File.findById(atlas.fileId).lean() : null;
              const atlasBuffer = toBuffer(atlasFile?.data);
              if (!atlasBuffer) {
                ipfsPayloadFailures.push({
                  itemKey,
                  resourceType: 'atlas-sprite-sheet',
                  mfsPath: itemPaths.atlasSpriteSheet,
                  reason: 'Atlas File payload not found in MongoDB',
                });
                continue;
              }

              const atlasCid = await exportCanonicalPayload({
                payloadBuffer: atlasBuffer,
                resourceType: 'atlas-sprite-sheet',
                mfsPath: itemPaths.atlasSpriteSheet,
                filename: `${itemKey}_atlas_sprite_sheet.png`,
                itemKey,
              });
              if (!atlasCid) continue;

              const linkedAtlasCid = atlas.cid || ol.data?.render?.cid || atlasCid;
              writeBackupPayloadAlias({
                canonicalCid: atlasCid,
                linkedCid: linkedAtlasCid,
                payloadBuffer: atlasBuffer,
              });
              expectedObjectLayerIpfsRefs.push({
                itemKey,
                resourceType: 'atlas-sprite-sheet',
                mfsPath: itemPaths.atlasSpriteSheet,
                linkedCid: linkedAtlasCid,
                fallbackCid: atlasCid,
              });

              const atlasMetadataBuffer = Buffer.from(stringify(atlasExport.metadata || {}), 'utf-8');
              const atlasMetadataCid = await exportCanonicalPayload({
                payloadBuffer: atlasMetadataBuffer,
                resourceType: 'atlas-metadata',
                mfsPath: itemPaths.atlasMetadata,
                filename: `${itemKey}_atlas_sprite_sheet_metadata.json`,
                itemKey,
              });
              if (!atlasMetadataCid) continue;

              const linkedAtlasMetadataCid = ol.data?.render?.metadataCid || atlasMetadataCid;
              writeBackupPayloadAlias({
                canonicalCid: atlasMetadataCid,
                linkedCid: linkedAtlasMetadataCid,
                payloadBuffer: atlasMetadataBuffer,
              });
              expectedObjectLayerIpfsRefs.push({
                itemKey,
                resourceType: 'atlas-metadata',
                mfsPath: itemPaths.atlasMetadata,
                linkedCid: linkedAtlasMetadataCid,
                fallbackCid: atlasMetadataCid,
              });

              atlasExport.cid = atlasCid;
              objectLayerExport.data.render.cid = atlasCid;
              objectLayerExport.data.render.metadataCid = atlasMetadataCid;
              fs.writeJsonSync(`${backupDir}/atlas-sprite-sheets/${itemKey}.json`, atlasExport, { spaces: 2 });
            } else {
              if (objectLayerExport.data.render?.cid || objectLayerExport.data.render?.metadataCid) {
                ipfsPayloadFailures.push({
                  itemKey,
                  resourceType: 'atlas-sprite-sheet',
                  mfsPath: itemPaths.atlasSpriteSheet,
                  reason: 'ObjectLayer references atlas CIDs but no AtlasSpriteSheet document exists',
                });
                continue;
              }
              delete objectLayerExport.data.render.cid;
              delete objectLayerExport.data.render.metadataCid;
            }

            const objectLayerBuffer = Buffer.from(stringify(objectLayerExport.data || {}), 'utf-8');
            const objectLayerCid = await exportCanonicalPayload({
              payloadBuffer: objectLayerBuffer,
              resourceType: 'object-layer-data',
              mfsPath: itemPaths.objectLayerData,
              filename: `${itemKey}_data.json`,
              itemKey,
            });
            if (!objectLayerCid) continue;

            const linkedObjectLayerCid = ol.cid || objectLayerCid;
            writeBackupPayloadAlias({
              canonicalCid: objectLayerCid,
              linkedCid: linkedObjectLayerCid,
              payloadBuffer: objectLayerBuffer,
            });
            expectedObjectLayerIpfsRefs.push({
              itemKey,
              resourceType: 'object-layer-data',
              mfsPath: itemPaths.objectLayerData,
              linkedCid: linkedObjectLayerCid,
              fallbackCid: objectLayerCid,
            });

            objectLayerExport.cid = objectLayerCid;
            fs.writeJsonSync(`${backupDir}/object-layers/${itemKey}.json`, objectLayerExport, { spaces: 2 });
          }

          if (ipfsPayloadFailures.length > 0) {
            for (const failure of ipfsPayloadFailures) {
              logger.error('Canonical IPFS payload export failed', failure);
            }
            await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
            process.exit(1);
          }

          const relatedPinPaths = [
            ...new Set(expectedObjectLayerIpfsRefs.map((entry) => entry.mfsPath).filter(Boolean)),
          ];
          const relatedPinCids = [
            ...new Set(
              expectedObjectLayerIpfsRefs.flatMap((entry) => [entry.linkedCid, entry.fallbackCid]).filter(Boolean),
            ),
          ];
          const relatedIpfsDocs =
            relatedPinPaths.length > 0 || relatedPinCids.length > 0
              ? await Ipfs.find({
                  $or: [
                    ...(relatedPinPaths.length ? [{ mfsPath: { $in: relatedPinPaths } }] : []),
                    ...(relatedPinCids.length ? [{ cid: { $in: relatedPinCids } }] : []),
                  ],
                }).lean()
              : [];

          let ipfsCollectionMatchCount = 0;
          let ipfsCollectionFallbackCount = 0;

          for (const ref of expectedObjectLayerIpfsRefs) {
            const matchingDoc = findInstanceRelatedIpfsDoc(relatedIpfsDocs, ref);
            const exportCid = matchingDoc?.cid || ref.linkedCid || ref.fallbackCid;

            if (!exportCid) {
              logger.warn('Skipping instance IPFS pin export because the ObjectLayer ref has no linked CID', {
                itemKey: ref.itemKey,
                resourceType: ref.resourceType,
                mfsPath: ref.mfsPath,
              });
              continue;
            }

            upsertCanonicalPinEntry(canonicalPins, {
              cid: exportCid,
              resourceType: ref.resourceType,
              mfsPath: ref.mfsPath,
            });

            if (matchingDoc) ipfsCollectionMatchCount++;
            else ipfsCollectionFallbackCount++;
          }

          const sanitised = serialiseCanonicalPins(canonicalPins);
          fs.writeJsonSync(`${backupDir}/ipfs/pins.json`, sanitised, { spaces: 2 });
          logger.info(
            `Exported ${sanitised.length} instance-related Ipfs pin record(s) and ${ipfsPayloadExportCount} raw payload file(s)`,
            {
              matchedFromIpfsCollection: ipfsCollectionMatchCount,
              fallbackFromObjectLayerRefs: ipfsCollectionFallbackCount,
              rawPayloadAliases: ipfsPayloadAliasCount,
            },
          );

          logger.info(`Exported ${objectLayers.length} ObjectLayer document(s)`, {
            itemIds: [...objectLayerItemIds],
          });
        } else {
          logger.info('No ObjectLayer references found in map entities');
        }

        logger.info('Instance export completed', { backupDir });
      }

      // ── IMPORT ──────────────────────────────────────────────────────
      if (options.import !== undefined) {
        const backupDir =
          typeof options.import === 'string' && options.import
            ? options.import
            : `./engine-private/cyberia-instances/${instanceCode}`;

        if (!fs.existsSync(backupDir)) {
          logger.error(`Backup directory not found: ${backupDir}`);
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
        }

        logger.info('Importing instance', { code: instanceCode, backupDir });

        // Item ids belonging to this instance (collected from imported object
        // layers + the instance doc) — used to backfill missing skills from the
        // canonical DefaultSkillConfig when the backup predates the skill model.
        const importedItemIds = new Set();

        // 0. Drop existing documents if --drop is set
        if (options.drop && !options.conf) {
          const existingInstance = await CyberiaInstance.findOne({ code: instanceCode }).lean();
          if (existingInstance) {
            const dropMapCodes = new Set(existingInstance.cyberiaMapCodes || []);
            for (const portal of existingInstance.portals || []) {
              if (portal.sourceMapCode) dropMapCodes.add(portal.sourceMapCode);
              if (portal.targetMapCode) dropMapCodes.add(portal.targetMapCode);
            }

            // Collect thumbnail File IDs to drop
            const thumbFileIds = [];
            if (existingInstance.thumbnail) thumbFileIds.push(existingInstance.thumbnail);
            const dropOlItemIds = new Set();

            // Query other instances/maps for shared thumbnail exclusion
            const otherInstances = await CyberiaInstance.find({ code: { $ne: instanceCode } }, { thumbnail: 1 }).lean();

            // Add instance-level itemIds (may not appear in any map entity)
            for (const entry of existingInstance.itemIds || []) {
              const id = typeof entry === 'string' ? entry : entry?.id;
              if (id) dropOlItemIds.add(id);
            }

            // Add conf entityDefaults and skillConfig itemIds (liveItemIds, deadItemIds, dropItemIds, defaultObjectLayers)
            const existingConf =
              (await CyberiaInstanceConf.findOne({ instanceCode }).lean()) ||
              (existingInstance.conf ? await CyberiaInstanceConf.findById(existingInstance.conf).lean() : null);
            if (existingConf) {
              for (const ed of existingConf.entityDefaults || []) {
                for (const id of ed.liveItemIds || []) if (id) dropOlItemIds.add(id);
                for (const id of ed.deadItemIds || []) if (id) dropOlItemIds.add(id);
                for (const id of ed.dropItemIds || []) if (id) dropOlItemIds.add(id);
                for (const slot of ed.defaultObjectLayers || []) if (slot.itemId) dropOlItemIds.add(slot.itemId);
              }
              for (const sc of existingConf.skillConfig || []) {
                if (sc.triggerItemId) dropOlItemIds.add(sc.triggerItemId);
                for (const skill of sc.skills || []) {
                  if (skill.summonedEntityItemId && !skill.summonedEntityItemId.startsWith('$'))
                    dropOlItemIds.add(skill.summonedEntityItemId);
                }
              }
            }

            const otherMaps = await CyberiaMap.find(
              { code: { $nin: [...dropMapCodes] } },
              { 'entities.objectLayerItemIds': 1, thumbnail: 1, preview: 1 },
            ).lean();

            if (dropMapCodes.size > 0) {
              const dropMaps = await CyberiaMap.find({ code: { $in: [...dropMapCodes] } }).lean();
              for (const map of dropMaps) {
                if (map.thumbnail) thumbFileIds.push(map.thumbnail);
                if (map.preview) thumbFileIds.push(map.preview);
                if (map.preview) thumbFileIds.push(map.preview);
                for (const entity of map.entities || []) {
                  for (const itemId of entity.objectLayerItemIds || []) {
                    dropOlItemIds.add(itemId);
                  }
                }
              }

              const mapResult = await CyberiaMap.deleteMany({ code: { $in: [...dropMapCodes] } });
              logger.info(`Dropped ${mapResult.deletedCount} CyberiaMap document(s)`);

              // Quests + actions are bound to maps by sourceMapCode, so they drop
              // with this instance's maps — only the content tied to this instance.
              const questResult = await CyberiaQuest.deleteMany({ sourceMapCode: { $in: [...dropMapCodes] } });
              if (questResult.deletedCount > 0)
                logger.info(`Dropped ${questResult.deletedCount} CyberiaQuest document(s)`);

              // Collect instance-specific dialogue codes the actions reference
              // (e.g. quest-talk-<questCode>) before deleting the actions. The
              // shared "default-<itemId>" greetings are left to the item-shared
              // logic below so dialogues shared with other instances survive.
              const dropActions = await CyberiaAction.find(
                { sourceMapCode: { $in: [...dropMapCodes] } },
                { dialogCode: 1, 'questDialogueCodes.dialogCode': 1 },
              ).lean();
              const dropActionDialogueCodes = new Set();
              const collectDlg = (code) => {
                if (code && !code.startsWith('default-')) dropActionDialogueCodes.add(code);
              };
              for (const a of dropActions) {
                collectDlg(a.dialogCode);
                for (const qd of a.questDialogueCodes || []) collectDlg(qd.dialogCode);
              }
              const actionResult = await CyberiaAction.deleteMany({ sourceMapCode: { $in: [...dropMapCodes] } });
              if (actionResult.deletedCount > 0)
                logger.info(`Dropped ${actionResult.deletedCount} CyberiaAction document(s)`);
              if (dropActionDialogueCodes.size > 0) {
                const advResult = await CyberiaDialogue.deleteMany({ code: { $in: [...dropActionDialogueCodes] } });
                if (advResult.deletedCount > 0)
                  logger.info(`Dropped ${advResult.deletedCount} CyberiaDialogue document(s) (action-referenced)`);
              }
            }

            // Exclude OL item IDs referenced by maps outside this instance
            const sharedOlItemIds = new Set();
            for (const m of otherMaps) {
              for (const entity of m.entities || []) {
                for (const itemId of entity.objectLayerItemIds || []) {
                  if (dropOlItemIds.has(itemId)) sharedOlItemIds.add(itemId);
                }
              }
            }
            for (const shared of sharedOlItemIds) dropOlItemIds.delete(shared);
            if (sharedOlItemIds.size > 0) {
              logger.info(`Preserved ${sharedOlItemIds.size} ObjectLayer(s) shared with other maps`);
            }

            // Exclude thumbnail/preview File IDs referenced by other instances or maps
            const otherMapThumbs = otherMaps
              .flatMap((m) => [m.thumbnail?.toString(), m.preview?.toString()])
              .filter(Boolean);
            const otherInstThumbs = otherInstances.map((i) => i.thumbnail?.toString()).filter(Boolean);
            const sharedThumbIds = new Set([...otherMapThumbs, ...otherInstThumbs]);
            for (let i = thumbFileIds.length - 1; i >= 0; i--) {
              if (sharedThumbIds.has(thumbFileIds[i].toString())) thumbFileIds.splice(i, 1);
            }

            if (dropOlItemIds.size > 0) {
              const dropDialogueCodes = [...dropOlItemIds].map((id) => `default-${id}`);
              const dialogueResult = await CyberiaDialogue.deleteMany({ code: { $in: dropDialogueCodes } });
              logger.info(`Dropped ${dialogueResult.deletedCount} CyberiaDialogue document(s)`);

              // Skills are keyed by triggerItemId — drop those whose trigger item is
              // being removed (i.e. not shared with another instance's maps).
              const skillResult = await CyberiaSkill.deleteMany({ triggerItemId: { $in: [...dropOlItemIds] } });
              if (skillResult.deletedCount > 0)
                logger.info(`Dropped ${skillResult.deletedCount} CyberiaSkill document(s)`);
              const olDocs = await ObjectLayer.find(
                { 'data.item.id': { $in: [...dropOlItemIds] } },
                {
                  cid: 1,
                  'data.item.id': 1,
                  'data.render': 1,
                  objectLayerRenderFramesId: 1,
                  atlasSpriteSheetId: 1,
                },
              ).lean();

              const cidsToUnpin = new Set();
              const renderFrameIds = [];
              const atlasIds = [];
              const itemKeysToClean = new Set();

              for (const doc of olDocs) {
                if (doc.cid) cidsToUnpin.add(doc.cid);
                if (doc.data?.render?.cid) cidsToUnpin.add(doc.data.render.cid);
                if (doc.data?.render?.metadataCid) cidsToUnpin.add(doc.data.render.metadataCid);
                if (doc.data?.item?.id) itemKeysToClean.add(doc.data.item.id);
                if (doc.objectLayerRenderFramesId) renderFrameIds.push(doc.objectLayerRenderFramesId);
                if (doc.atlasSpriteSheetId) atlasIds.push(doc.atlasSpriteSheetId);
              }

              // Delete AtlasSpriteSheet + referenced File docs
              if (atlasIds.length > 0) {
                const atlasDocs = await AtlasSpriteSheet.find({ _id: { $in: atlasIds } }, { fileId: 1, cid: 1 }).lean();
                const atlasFileIds = atlasDocs.map((a) => a.fileId).filter(Boolean);
                for (const atlas of atlasDocs) {
                  if (atlas.cid) cidsToUnpin.add(atlas.cid);
                }
                if (atlasFileIds.length > 0) {
                  const fileResult = await File.deleteMany({ _id: { $in: atlasFileIds } });
                  logger.info(`Dropped ${fileResult.deletedCount} File document(s) (atlas)`);
                }
                const atlasResult = await AtlasSpriteSheet.deleteMany({ _id: { $in: atlasIds } });
                logger.info(`Dropped ${atlasResult.deletedCount} AtlasSpriteSheet document(s)`);
              }

              // Delete RenderFrames
              if (renderFrameIds.length > 0) {
                const rfResult = await ObjectLayerRenderFrames.deleteMany({ _id: { $in: renderFrameIds } });
                logger.info(`Dropped ${rfResult.deletedCount} ObjectLayerRenderFrames document(s)`);
              }

              // Delete IPFS pin records
              if (cidsToUnpin.size > 0) {
                const ipfsResult = await Ipfs.deleteMany({ cid: { $in: [...cidsToUnpin] } });
                logger.info(`Dropped ${ipfsResult.deletedCount} Ipfs pin record(s)`);
              }

              // Unpin CIDs from IPFS Kubo + Cluster and remove MFS paths
              let unpinCount = 0;
              for (const cid of cidsToUnpin) {
                const ok = await IpfsClient.unpinCid(cid);
                if (ok) unpinCount++;
              }
              let mfsCount = 0;
              for (const itemKey of itemKeysToClean) {
                const ok = await IpfsClient.removeMfsPath(`/object-layer/${itemKey}`);
                if (ok) mfsCount++;
              }
              logger.info(
                `IPFS cleanup: ${unpinCount}/${cidsToUnpin.size} CIDs unpinned, ${mfsCount}/${itemKeysToClean.size} MFS paths removed`,
              );

              const olResult = await ObjectLayer.deleteMany({ 'data.item.id': { $in: [...dropOlItemIds] } });
              logger.info(`Dropped ${olResult.deletedCount} ObjectLayer document(s)`);
            }

            // Drop thumbnail File documents (instance + maps), excluding shared ones
            if (thumbFileIds.length > 0) {
              const thumbResult = await File.deleteMany({ _id: { $in: thumbFileIds } });
              logger.info(`Dropped ${thumbResult.deletedCount} File document(s) (thumbnails)`);
            }

            await CyberiaInstance.deleteOne({ code: instanceCode });
            logger.info('Dropped CyberiaInstance', { code: instanceCode });
            await CyberiaInstanceConf.deleteOne({ instanceCode });
            logger.info('Dropped CyberiaInstanceConf', { instanceCode });
          } else {
            logger.info('No existing instance to drop', { code: instanceCode });
          }
        } else if (options.drop && options.conf) {
          logger.info(
            'Skipping full instance drop because --conf only imports cyberia-instance.json and cyberia-instance-conf.json',
          );
        }

        if (options.conf) {
          const confImportPath = `${backupDir}/cyberia-instance-conf.json`;
          let importedConf = null;
          if (fs.existsSync(confImportPath)) {
            // Backfill any missing schema fields so older backups import a
            // complete, playable config into the DB.
            const confData = fillInstanceConfDefaults(fs.readJsonSync(confImportPath));
            if (confData._id) await CyberiaInstanceConf.deleteOne({ _id: confData._id });
            await CyberiaInstanceConf.deleteOne({ instanceCode: confData.instanceCode });
            // Always bump updatedAt so the Go server's version hash changes and
            // ReloadWorld re-applies the config without requiring a full restart.
            confData.updatedAt = new Date();
            importedConf = await CyberiaInstanceConf.create(confData);
            logger.info('Imported CyberiaInstanceConf', { instanceCode: confData.instanceCode });
          } else {
            logger.warn(`CyberiaInstanceConf backup not found: ${confImportPath}`);
          }

          // In --conf mode we must NOT delete + recreate the CyberiaInstance because
          // that would overwrite cyberiaMapCodes / portals / itemIds with whatever was
          // in the (possibly stale) backup, effectively removing the live maps and OLs
          // from the instance.  Only update the conf ref and bump updatedAt so the Go
          // server's version hash changes and ReloadWorld re-applies the config.
          if (importedConf) {
            const result = await CyberiaInstance.updateOne(
              { code: instanceCode },
              { $set: { conf: importedConf._id, updatedAt: new Date() } },
            );
            if (result.matchedCount > 0) {
              logger.info('Updated CyberiaInstance conf ref', { code: instanceCode });
            } else {
              logger.warn(`CyberiaInstance not found in DB for code "${instanceCode}" — cannot update conf ref`);
            }
          } else {
            logger.warn(`Skipping CyberiaInstance conf ref update — no conf was imported`);
          }

          logger.info('Instance import completed in --conf mode', {
            backupDir,
            importedFiles: ['cyberia-instance.json', 'cyberia-instance-conf.json'],
          });
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          return;
        }

        // 1. Import File documents first (atlas PNG + thumbnail dependencies)
        const filesDir = `${backupDir}/files`;
        if (fs.existsSync(filesDir)) {
          const fileFiles = fs.readdirSync(filesDir).filter((f) => f.endsWith('.json'));
          let fileCount = 0;
          for (const f of fileFiles) {
            const fileData = fs.readJsonSync(`${filesDir}/${f}`);
            // Restore base64-encoded Buffer (handle both $base64 and { type: 'Buffer', data: [...] })
            if (fileData.data) {
              if (fileData.data.$base64) {
                fileData.data = Buffer.from(fileData.data.$base64, 'base64');
              } else if (fileData.data.type === 'Buffer' && Array.isArray(fileData.data.data)) {
                fileData.data = Buffer.from(fileData.data.data);
              }
            }
            // preserveUUID: delete any existing doc with this _id then create with exact _id
            await File.deleteOne({ _id: fileData._id });
            await File.create(fileData);
            fileCount++;
          }
          logger.info(`Imported ${fileCount} File document(s)`);
        }

        // 2. Import ObjectLayerRenderFrames
        const rfDir = `${backupDir}/render-frames`;
        if (fs.existsSync(rfDir)) {
          const rfFiles = fs.readdirSync(rfDir).filter((f) => f.endsWith('.json'));
          let rfCount = 0;
          for (const f of rfFiles) {
            const rfData = fs.readJsonSync(`${rfDir}/${f}`);
            if (rfData._id) {
              await ObjectLayerRenderFrames.deleteOne({ _id: rfData._id });
              await ObjectLayerRenderFrames.create(rfData);
              rfCount++;
            }
          }
          logger.info(`Imported ${rfCount} ObjectLayerRenderFrames document(s)`);
        }

        // 3. Import AtlasSpriteSheet
        const atlasDir = `${backupDir}/atlas-sprite-sheets`;
        if (fs.existsSync(atlasDir)) {
          const atlasFiles = fs.readdirSync(atlasDir).filter((f) => f.endsWith('.json'));
          let atlasCount = 0;
          for (const f of atlasFiles) {
            const atlasData = fs.readJsonSync(`${atlasDir}/${f}`);
            await AtlasSpriteSheet.deleteOne({ _id: atlasData._id });
            if (atlasData.metadata?.itemKey) {
              await AtlasSpriteSheet.deleteOne({ 'metadata.itemKey': atlasData.metadata.itemKey });
            }
            await AtlasSpriteSheet.create(atlasData);
            atlasCount++;
          }
          logger.info(`Imported ${atlasCount} AtlasSpriteSheet document(s)`);
        }

        // 4. Import object layers
        const olDir = `${backupDir}/object-layers`;
        if (fs.existsSync(olDir)) {
          const olFiles = fs.readdirSync(olDir).filter((f) => f.endsWith('.json'));
          let olCount = 0;
          for (const file of olFiles) {
            const olData = fs.readJsonSync(`${olDir}/${file}`);
            await ObjectLayer.deleteOne({ _id: olData._id });
            if (olData.sha256) {
              await ObjectLayer.deleteOne({ sha256: olData.sha256 });
            }
            await ObjectLayer.create(olData);
            if (olData.data?.item?.id) importedItemIds.add(olData.data.item.id);
            olCount++;
          }
          logger.info(`Imported ${olCount} ObjectLayer document(s)`);
        }

        // 4b. Regenerate static frame PNGs from imported render-frames + object-layer documents.
        //     Mirrors the writeStaticFrameAssets call in `ol --import` so src/client/public/cyberia
        //     and the public/<host><path> deployment dir are populated even when the cyberia
        //     asset directory was wiped (e.g. git clean / rm -rf).
        const rfImportDir = `${backupDir}/render-frames`;
        const olImportDir = `${backupDir}/object-layers`;
        if (fs.existsSync(rfImportDir) && fs.existsSync(olImportDir)) {
          const srcBasePath = './src/client/public/cyberia/';
          const publicBasePath = `./public/${host}${path}`;
          let staticWriteCount = 0;
          const rfFileList = fs.readdirSync(rfImportDir).filter((f) => f.endsWith('.json'));
          for (const rfFile of rfFileList) {
            const rfData = fs.readJsonSync(`${rfImportDir}/${rfFile}`);
            const itemId = nodePath.basename(rfFile, '.json');
            const olFile = `${olImportDir}/${itemId}.json`;
            if (!fs.existsSync(olFile)) {
              logger.warn(`Skipping static asset generation for '${itemId}' — no matching object-layer file`);
              continue;
            }
            const olData = fs.readJsonSync(olFile);
            const itemType = olData.data?.item?.type;
            if (!itemType) {
              logger.warn(`Skipping static asset generation for '${itemId}' — missing data.item.type`);
              continue;
            }
            // rfData matches the ObjectLayerRenderFrames schema: { frames, colors, frame_duration }
            const objectLayerRenderFramesData = {
              frames: rfData.frames || {},
              colors: rfData.colors || [],
              frame_duration: rfData.frame_duration ?? 100,
            };
            try {
              const written = await ObjectLayerEngine.writeStaticFrameAssets({
                basePaths: [srcBasePath, publicBasePath],
                itemType,
                itemId,
                objectLayerRenderFramesData,
                objectLayerData: olData,
                cellPixelDim: 20,
              });
              staticWriteCount += written.length;
            } catch (err) {
              logger.warn(`Failed to write static assets for '${itemId}': ${err.message}`);
            }
          }
          logger.info(`Static frame PNGs written: ${staticWriteCount} file(s) across src/client/public and public/`);
        }

        // 5. Import maps (preserveUUID: delete by code then create with exact _id)
        const mapsDir = `${backupDir}/maps`;
        if (fs.existsSync(mapsDir)) {
          const mapFiles = fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json'));
          let mapCount = 0;
          for (const file of mapFiles) {
            const mapData = fs.readJsonSync(`${mapsDir}/${file}`);
            await CyberiaMap.deleteOne({ code: mapData.code });
            await CyberiaMap.deleteOne({ _id: mapData._id });
            await CyberiaMap.create(mapData);
            mapCount++;
          }
          logger.info(`Imported ${mapCount} CyberiaMap document(s)`);
        }

        // 6. Import CyberiaInstanceConf (skillRules, equipmentRules, entityDefaults, etc.)
        const confImportPath = `${backupDir}/cyberia-instance-conf.json`;
        if (fs.existsSync(confImportPath)) {
          // Backfill any missing schema fields so older backups import a
          // complete, playable config into the DB.
          const confData = fillInstanceConfDefaults(fs.readJsonSync(confImportPath));
          if (confData._id) await CyberiaInstanceConf.deleteOne({ _id: confData._id });
          await CyberiaInstanceConf.deleteOne({ instanceCode: confData.instanceCode });
          await CyberiaInstanceConf.create(confData);
          logger.info('Imported CyberiaInstanceConf', { instanceCode: confData.instanceCode });
        } else {
          logger.warn(`CyberiaInstanceConf backup not found: ${confImportPath}`);
        }

        // 7. Import instance (preserveUUID: delete by code then create with exact _id)
        const instancePath = `${backupDir}/cyberia-instance.json`;
        if (fs.existsSync(instancePath)) {
          const instanceData = fs.readJsonSync(instancePath);
          // Heal legacy shapes against the current model. itemIds migrated from a
          // flat string[] to [{ id, defaultPlayerInventory }] — a raw old backup
          // would fail Mongoose embedded-cast validation, so normalize it here.
          instanceData.itemIds = (instanceData.itemIds || [])
            .map((entry) => (typeof entry === 'string' ? { id: entry, defaultPlayerInventory: false } : entry))
            .filter((entry) => entry && entry.id);
          for (const entry of instanceData.itemIds) importedItemIds.add(entry.id);
          await CyberiaInstance.deleteOne({ code: instanceCode });
          await CyberiaInstance.deleteOne({ _id: instanceData._id });
          await CyberiaInstance.create(instanceData);
          logger.info('Imported CyberiaInstance', { code: instanceCode });
        } else {
          logger.warn(`Instance file not found: ${instancePath}`);
        }

        // 8. Import CyberiaDialogue documents
        const dialoguesDir = `${backupDir}/cyberia-dialogues`;
        if (fs.existsSync(dialoguesDir)) {
          const dialogueFiles = fs.readdirSync(dialoguesDir).filter((f) => f.endsWith('.json'));
          let dialogueCount = 0;

          for (const file of dialogueFiles) {
            const rawDialogueData = fs.readJsonSync(`${dialoguesDir}/${file}`);
            const dialogues = Array.isArray(rawDialogueData) ? rawDialogueData : [rawDialogueData];
            const dialogueCodes = [...new Set(dialogues.map((dialogue) => dialogue.code).filter(Boolean))];
            if (dialogueCodes.length === 0) {
              logger.warn(`Skipping CyberiaDialogue backup without code: ${file}`);
              continue;
            }

            await CyberiaDialogue.deleteMany({ code: { $in: dialogueCodes } });

            const dialogueIds = dialogues.map((dialogue) => dialogue._id).filter(Boolean);
            if (dialogueIds.length > 0) {
              await CyberiaDialogue.deleteMany({ _id: { $in: dialogueIds } });
            }

            await CyberiaDialogue.create(dialogues);
            dialogueCount += dialogues.length;
          }

          logger.info(`Imported ${dialogueCount} CyberiaDialogue document(s)`);
        }

        // 8b. Import CyberiaQuest documents (overwrite by code).
        const questsDir = `${backupDir}/cyberia-quests`;
        if (fs.existsSync(questsDir)) {
          const questFiles = fs.readdirSync(questsDir).filter((f) => f.endsWith('.json'));
          let questCount = 0;
          for (const file of questFiles) {
            const questData = fs.readJsonSync(`${questsDir}/${file}`);
            if (!questData.code) {
              logger.warn(`Skipping CyberiaQuest backup without code: ${file}`);
              continue;
            }
            await CyberiaQuest.deleteOne({ code: questData.code });
            if (questData._id) await CyberiaQuest.deleteOne({ _id: questData._id });
            await CyberiaQuest.create(questData);
            questCount++;
          }
          logger.info(`Imported ${questCount} CyberiaQuest document(s)`);
        }

        // 8c. Import CyberiaAction documents (overwrite by code).
        const actionsDir = `${backupDir}/cyberia-actions`;
        if (fs.existsSync(actionsDir)) {
          const actionFiles = fs.readdirSync(actionsDir).filter((f) => f.endsWith('.json'));
          let actionCount = 0;
          for (const file of actionFiles) {
            const actionData = fs.readJsonSync(`${actionsDir}/${file}`);
            if (!actionData.code) {
              logger.warn(`Skipping CyberiaAction backup without code: ${file}`);
              continue;
            }
            await CyberiaAction.deleteOne({ code: actionData.code });
            if (actionData._id) await CyberiaAction.deleteOne({ _id: actionData._id });
            await CyberiaAction.create(actionData);
            actionCount++;
          }
          logger.info(`Imported ${actionCount} CyberiaAction document(s)`);
        }

        // 8d. Import CyberiaSkill documents (own model, overwrite by triggerItemId).
        const skillsDir = `${backupDir}/cyberia-skills`;
        if (fs.existsSync(skillsDir)) {
          const skillFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.json'));
          let skillCount = 0;
          for (const file of skillFiles) {
            const skillData = fs.readJsonSync(`${skillsDir}/${file}`);
            if (!skillData.triggerItemId) {
              logger.warn(`Skipping CyberiaSkill backup without triggerItemId: ${file}`);
              continue;
            }
            await CyberiaSkill.deleteOne({ triggerItemId: skillData.triggerItemId });
            if (skillData._id) await CyberiaSkill.deleteOne({ _id: skillData._id });
            await CyberiaSkill.create(skillData);
            skillCount++;
          }
          logger.info(`Imported ${skillCount} CyberiaSkill document(s)`);
        }

        // 8d-bis. Import CyberiaEntityTypeDefault documents (own model, overwrite
        //     by the natural (entityType, liveItemIds) key, then by _id).
        const entityDefaultsDir = `${backupDir}/cyberia-entity-type-defaults`;
        if (fs.existsSync(entityDefaultsDir)) {
          const entityDefaultFiles = fs.readdirSync(entityDefaultsDir).filter((f) => f.endsWith('.json'));
          let entityDefaultCount = 0;
          for (const file of entityDefaultFiles) {
            const edData = fs.readJsonSync(`${entityDefaultsDir}/${file}`);
            if (!edData.entityType) {
              logger.warn(`Skipping CyberiaEntityTypeDefault backup without entityType: ${file}`);
              continue;
            }
            await CyberiaEntityTypeDefault.deleteMany({
              entityType: edData.entityType,
              liveItemIds: edData.liveItemIds || [],
            });
            if (edData._id) await CyberiaEntityTypeDefault.deleteOne({ _id: edData._id });
            await CyberiaEntityTypeDefault.create(edData);
            entityDefaultCount++;
          }
          logger.info(`Imported ${entityDefaultCount} CyberiaEntityTypeDefault document(s)`);
        }

        // 8e. Backfill missing skills from the canonical DefaultSkillConfig. Old
        //     backups predate the CyberiaSkill model and ship no skills/ dir, so
        //     any instance item that has a canonical skill (e.g. atlas_pistol_mk2,
        //     coin, hatchet) but no document yet is seeded from defaults. Existing
        //     skills are never overwritten.
        let backfilledSkillCount = 0;
        for (const sk of DefaultSkillConfig) {
          if (!importedItemIds.has(sk.triggerItemId)) continue;
          const exists = await CyberiaSkill.findOne({ triggerItemId: sk.triggerItemId }).lean();
          if (exists) continue;
          await CyberiaSkill.create({
            triggerItemId: sk.triggerItemId,
            logicEventIds: sk.logicEventIds || [],
            skills: sk.skills || [],
          });
          backfilledSkillCount++;
        }
        if (backfilledSkillCount > 0) {
          logger.info(`Backfilled ${backfilledSkillCount} CyberiaSkill document(s) from DefaultSkillConfig`);
        }

        // 8f. Import CyberiaSaga documents (overwrite by code).
        const sagasDir = `${backupDir}/cyberia-sagas`;
        if (fs.existsSync(sagasDir)) {
          const sagaFiles = fs.readdirSync(sagasDir).filter((f) => f.endsWith('.json'));
          let sagaCount = 0;
          for (const file of sagaFiles) {
            const sagaData = fs.readJsonSync(`${sagasDir}/${file}`);
            if (!sagaData.code) {
              logger.warn(`Skipping CyberiaSaga backup without code: ${file}`);
              continue;
            }
            await CyberiaSaga.deleteOne({ code: sagaData.code });
            if (sagaData._id) await CyberiaSaga.deleteOne({ _id: sagaData._id });
            await CyberiaSaga.create(sagaData);
            sagaCount++;
          }
          logger.info(`Imported ${sagaCount} CyberiaSaga document(s)`);
        }

        // 9. Restore IPFS pin records and payloads
        const ipfsFile = `${backupDir}/ipfs/pins.json`;
        if (fs.existsSync(ipfsFile)) {
          await reconcileIpfsRegistryIndexes();
          const ipfsDocs = fs.readJsonSync(ipfsFile);
          const ipfsContentDir = `${backupDir}/ipfs/content`;
          let ipfsCount = 0;
          let ipfsSkipped = 0;

          const backupPins = new Map();
          for (const doc of ipfsDocs) {
            const resourceType = inferResourceType(doc);
            if (!resourceType) {
              logger.warn(
                `Ipfs record is missing resourceType and cannot be inferred (cid: ${doc.cid}, mfsPath: ${doc.mfsPath ?? '(none)'}) — skipping`,
              );
              ipfsSkipped++;
              continue;
            }

            const mfsPaths = collectMfsPaths(doc);
            if (mfsPaths.length === 0) {
              upsertCanonicalPinEntry(backupPins, { cid: doc.cid, resourceType, mfsPath: '' });
            } else {
              for (const mfsPath of mfsPaths) {
                upsertCanonicalPinEntry(backupPins, { cid: doc.cid, resourceType, mfsPath });
              }
            }
          }

          const backupPinEntries = serialiseCanonicalPins(backupPins);

          if (fs.existsSync(ipfsContentDir)) {
            let cidRewriteCount = 0;
            let ipfsAlreadyPresent = 0;

            for (const [index, doc] of backupPinEntries.entries()) {
              const primaryPath = doc.mfsPath || '';
              const payloadPath = `${ipfsContentDir}/${doc.cid}.bin`;

              try {
                const existing = await Ipfs.findOne(
                  primaryPath ? { mfsPath: primaryPath } : { cid: doc.cid, resourceType: doc.resourceType },
                )
                  .select({ _id: 1 })
                  .lean();
                if (existing) {
                  ipfsAlreadyPresent++;
                  continue;
                }

                logger.info('IPFS raw payload restore start', {
                  index: index + 1,
                  total: backupPinEntries.length,
                  cid: doc.cid,
                  resourceType: doc.resourceType,
                  mfsPath: primaryPath || null,
                });

                if (!fs.existsSync(payloadPath)) {
                  logger.warn('IPFS raw payload file missing from backup', {
                    cid: doc.cid,
                    resourceType: doc.resourceType,
                    mfsPath: primaryPath || null,
                  });
                  ipfsSkipped++;
                  continue;
                }

                const addResult = await IpfsClient.addToIpfs(
                  fs.readFileSync(payloadPath),
                  nodePath.basename(primaryPath || doc.cid),
                  primaryPath || undefined,
                );

                if (!addResult?.cid) {
                  logger.warn('IPFS raw payload restore failed', {
                    cid: doc.cid,
                    resourceType: doc.resourceType,
                    mfsPath: primaryPath || null,
                  });
                  ipfsSkipped++;
                  continue;
                }

                const finalCid = addResult.cid;
                if (doc.cid !== finalCid) {
                  await rewriteImportedCidReferences({
                    oldCid: doc.cid,
                    newCid: finalCid,
                    resourceType: doc.resourceType,
                  });
                  cidRewriteCount++;
                  logger.warn('IPFS raw payload CID mismatch during import; rewriting imported references', {
                    oldCid: doc.cid,
                    newCid: finalCid,
                    resourceType: doc.resourceType,
                    mfsPath: primaryPath || null,
                  });
                }

                // createPinRecord is an idempotent upsert keyed by mfsPath.
                await createPinRecord({
                  cid: finalCid,
                  resourceType: doc.resourceType,
                  mfsPath: primaryPath || '',
                  options: { host, path },
                });
                ipfsCount++;
              } catch (entryError) {
                logger.warn('IPFS pin restore failed for one entry — skipping it, the import continues', {
                  cid: doc.cid,
                  resourceType: doc.resourceType,
                  mfsPath: primaryPath || null,
                  error: entryError?.message ?? String(entryError),
                });
                ipfsSkipped++;
              }
            }

            logger.info(
              `Imported ${ipfsCount} Ipfs pin record(s) from exact backup payloads` +
                `${ipfsAlreadyPresent ? `, ${ipfsAlreadyPresent} already present (skipped)` : ''}` +
                `${ipfsSkipped ? `, ${ipfsSkipped} skipped` : ''}`,
            );
            logger.info(
              `IPFS raw payload restore: ${ipfsCount}/${backupPinEntries.length} record(s) restored${cidRewriteCount ? `, ${cidRewriteCount} CID rewrite(s)` : ''}`,
            );
          } else {
            logger.warn(
              'Backup has no raw IPFS payload files under ipfs/content/. Rebuilding a canonical IPFS layout from imported ObjectLayer, AtlasSpriteSheet, and File documents.',
            );

            const importedItemIds = fs.existsSync(olDir)
              ? fs
                  .readdirSync(olDir)
                  .filter((f) => f.endsWith('.json'))
                  .map((f) => nodePath.basename(f, '.json'))
              : [];
            const importedObjectLayers = importedItemIds.length
              ? await ObjectLayer.find({ 'data.item.id': { $in: importedItemIds } }).lean()
              : [];

            let rebuiltObjectLayers = 0;

            for (const [index, objectLayerDoc] of importedObjectLayers.entries()) {
              const itemKey = objectLayerDoc.data?.item?.id || objectLayerDoc._id.toString();
              const itemPaths = getCanonicalIpfsPaths(itemKey);
              const updatedData = newInstance(objectLayerDoc.data || {});
              if (!updatedData.render) updatedData.render = {};

              logger.info('IPFS legacy canonical rebuild start', {
                index: index + 1,
                total: importedObjectLayers.length,
                itemKey,
              });

              let atlasCid = '';
              let atlasMetadataCid = '';

              if (objectLayerDoc.atlasSpriteSheetId) {
                const atlasDoc = await AtlasSpriteSheet.findById(objectLayerDoc.atlasSpriteSheetId).lean();
                if (atlasDoc) {
                  const atlasFile = atlasDoc.fileId ? await File.findById(atlasDoc.fileId).lean() : null;
                  const atlasBuffer = toBuffer(atlasFile?.data);

                  if (atlasBuffer) {
                    const atlasAddResult = await IpfsClient.addBufferToIpfs(
                      atlasBuffer,
                      `${itemKey}_atlas_sprite_sheet.png`,
                      itemPaths.atlasSpriteSheet,
                    );
                    if (atlasAddResult?.cid) {
                      atlasCid = atlasAddResult.cid;
                      await AtlasSpriteSheet.updateOne({ _id: atlasDoc._id }, { $set: { cid: atlasCid } });
                      await createPinRecord({
                        cid: atlasCid,
                        resourceType: 'atlas-sprite-sheet',
                        mfsPath: itemPaths.atlasSpriteSheet,
                        options: { host, path },
                      });
                      ipfsCount++;
                    } else {
                      logger.warn(`Failed to rebuild atlas sprite sheet payload for '${itemKey}'`);
                    }
                  } else if (atlasDoc.fileId) {
                    logger.warn(`Atlas File payload missing for '${itemKey}'`);
                  }

                  const atlasMetadataResult = await IpfsClient.addJsonToIpfs(
                    atlasDoc.metadata || {},
                    `${itemKey}_atlas_sprite_sheet_metadata.json`,
                    itemPaths.atlasMetadata,
                  );
                  if (atlasMetadataResult?.cid) {
                    atlasMetadataCid = atlasMetadataResult.cid;
                    await createPinRecord({
                      cid: atlasMetadataCid,
                      resourceType: 'atlas-metadata',
                      mfsPath: itemPaths.atlasMetadata,
                      options: { host, path },
                    });
                    ipfsCount++;
                  } else {
                    logger.warn(`Failed to rebuild atlas metadata payload for '${itemKey}'`);
                  }
                }
              }

              if (atlasCid) {
                updatedData.render.cid = atlasCid;
              } else {
                delete updatedData.render.cid;
              }
              if (atlasMetadataCid) {
                updatedData.render.metadataCid = atlasMetadataCid;
              } else {
                delete updatedData.render.metadataCid;
              }

              const objectLayerAddResult = await IpfsClient.addJsonToIpfs(
                updatedData,
                `${itemKey}_data.json`,
                itemPaths.objectLayerData,
              );
              if (objectLayerAddResult?.cid) {
                await ObjectLayer.updateOne(
                  { _id: objectLayerDoc._id },
                  {
                    $set: {
                      cid: objectLayerAddResult.cid,
                      data: updatedData,
                    },
                  },
                );
                await createPinRecord({
                  cid: objectLayerAddResult.cid,
                  resourceType: 'object-layer-data',
                  mfsPath: itemPaths.objectLayerData,
                  options: { host, path },
                });
                ipfsCount++;
                rebuiltObjectLayers++;
              } else {
                logger.warn(`Failed to rebuild object-layer-data payload for '${itemKey}'`);
                ipfsSkipped++;
              }
            }

            logger.info(
              `Legacy IPFS rebuild: ${rebuiltObjectLayers}/${importedObjectLayers.length} ObjectLayer payload(s) rebuilt, ${ipfsCount} canonical pin record(s) upserted${ipfsSkipped ? `, skipped ${ipfsSkipped}` : ''}`,
            );
          }
        }

        logger.info('Instance import completed', { backupDir });
      }

      // ── DROP (standalone) ───────────────────────────────────────────
      if (options.drop && options.import === undefined) {
        const existingInstance = await CyberiaInstance.findOne({ code: instanceCode }).lean();
        if (existingInstance) {
          const dropMapCodes = new Set(existingInstance.cyberiaMapCodes || []);
          for (const portal of existingInstance.portals || []) {
            if (portal.sourceMapCode) dropMapCodes.add(portal.sourceMapCode);
            if (portal.targetMapCode) dropMapCodes.add(portal.targetMapCode);
          }

          // Collect thumbnail File IDs to drop
          const thumbFileIds = [];
          if (existingInstance.thumbnail) thumbFileIds.push(existingInstance.thumbnail);
          const dropOlItemIds = new Set();

          // Query other instances for shared thumbnail exclusion
          const otherInstances = await CyberiaInstance.find({ code: { $ne: instanceCode } }, { thumbnail: 1 }).lean();

          // Add instance-level itemIds (may not appear in any map entity)
          for (const entry of existingInstance.itemIds || []) {
            const id = typeof entry === 'string' ? entry : entry?.id;
            if (id) dropOlItemIds.add(id);
          }

          // Add conf entityDefaults and skillConfig itemIds (liveItemIds, deadItemIds, dropItemIds, defaultObjectLayers)
          const existingConf =
            (await CyberiaInstanceConf.findOne({ instanceCode }).lean()) ||
            (existingInstance.conf ? await CyberiaInstanceConf.findById(existingInstance.conf).lean() : null);
          if (existingConf) {
            for (const ed of existingConf.entityDefaults || []) {
              for (const id of ed.liveItemIds || []) if (id) dropOlItemIds.add(id);
              for (const id of ed.deadItemIds || []) if (id) dropOlItemIds.add(id);
              for (const id of ed.dropItemIds || []) if (id) dropOlItemIds.add(id);
              for (const slot of ed.defaultObjectLayers || []) if (slot.itemId) dropOlItemIds.add(slot.itemId);
            }
            for (const sc of existingConf.skillConfig || []) {
              if (sc.triggerItemId) dropOlItemIds.add(sc.triggerItemId);
              for (const skill of sc.skills || []) {
                if (skill.summonedEntityItemId && !skill.summonedEntityItemId.startsWith('$'))
                  dropOlItemIds.add(skill.summonedEntityItemId);
              }
            }
          }

          const otherMaps = await CyberiaMap.find(
            { code: { $nin: [...dropMapCodes] } },
            { 'entities.objectLayerItemIds': 1, thumbnail: 1, preview: 1 },
          ).lean();

          if (dropMapCodes.size > 0) {
            const dropMaps = await CyberiaMap.find({ code: { $in: [...dropMapCodes] } }).lean();
            for (const map of dropMaps) {
              if (map.thumbnail) thumbFileIds.push(map.thumbnail);
              if (map.preview) thumbFileIds.push(map.preview);
              for (const entity of map.entities || []) {
                for (const itemId of entity.objectLayerItemIds || []) {
                  dropOlItemIds.add(itemId);
                }
              }
            }
            const mapResult = await CyberiaMap.deleteMany({ code: { $in: [...dropMapCodes] } });
            logger.info(`Dropped ${mapResult.deletedCount} CyberiaMap document(s)`);
          }

          // Exclude OL item IDs referenced by maps outside this instance
          const sharedOlItemIds = new Set();
          for (const m of otherMaps) {
            for (const entity of m.entities || []) {
              for (const itemId of entity.objectLayerItemIds || []) {
                if (dropOlItemIds.has(itemId)) sharedOlItemIds.add(itemId);
              }
            }
          }
          for (const shared of sharedOlItemIds) dropOlItemIds.delete(shared);
          if (sharedOlItemIds.size > 0) {
            logger.info(`Preserved ${sharedOlItemIds.size} ObjectLayer(s) shared with other maps`);
          }

          // Exclude thumbnail/preview File IDs referenced by other instances or maps
          const otherMapThumbs = otherMaps
            .flatMap((m) => [m.thumbnail?.toString(), m.preview?.toString()])
            .filter(Boolean);
          const otherInstThumbs = otherInstances.map((i) => i.thumbnail?.toString()).filter(Boolean);
          const sharedThumbIds = new Set([...otherMapThumbs, ...otherInstThumbs]);
          for (let i = thumbFileIds.length - 1; i >= 0; i--) {
            if (sharedThumbIds.has(thumbFileIds[i].toString())) thumbFileIds.splice(i, 1);
          }

          if (dropOlItemIds.size > 0) {
            const dropDialogueCodes = [...dropOlItemIds].map((id) => `default-${id}`);
            const dialogueResult = await CyberiaDialogue.deleteMany({ code: { $in: dropDialogueCodes } });
            logger.info(`Dropped ${dialogueResult.deletedCount} CyberiaDialogue document(s)`);

            const olDocs = await ObjectLayer.find(
              { 'data.item.id': { $in: [...dropOlItemIds] } },
              {
                cid: 1,
                'data.item.id': 1,
                'data.render': 1,
                objectLayerRenderFramesId: 1,
                atlasSpriteSheetId: 1,
              },
            ).lean();

            const cidsToUnpin = new Set();
            const renderFrameIds = [];
            const atlasIds = [];
            const itemKeysToClean = new Set();

            for (const doc of olDocs) {
              if (doc.cid) cidsToUnpin.add(doc.cid);
              if (doc.data?.render?.cid) cidsToUnpin.add(doc.data.render.cid);
              if (doc.data?.render?.metadataCid) cidsToUnpin.add(doc.data.render.metadataCid);
              if (doc.data?.item?.id) itemKeysToClean.add(doc.data.item.id);
              if (doc.objectLayerRenderFramesId) renderFrameIds.push(doc.objectLayerRenderFramesId);
              if (doc.atlasSpriteSheetId) atlasIds.push(doc.atlasSpriteSheetId);
            }

            if (atlasIds.length > 0) {
              const atlasDocs = await AtlasSpriteSheet.find({ _id: { $in: atlasIds } }, { fileId: 1, cid: 1 }).lean();
              const atlasFileIds = atlasDocs.map((a) => a.fileId).filter(Boolean);
              for (const atlas of atlasDocs) {
                if (atlas.cid) cidsToUnpin.add(atlas.cid);
              }
              if (atlasFileIds.length > 0) {
                const fileResult = await File.deleteMany({ _id: { $in: atlasFileIds } });
                logger.info(`Dropped ${fileResult.deletedCount} File document(s) (atlas)`);
              }
              const atlasResult = await AtlasSpriteSheet.deleteMany({ _id: { $in: atlasIds } });
              logger.info(`Dropped ${atlasResult.deletedCount} AtlasSpriteSheet document(s)`);
            }

            if (renderFrameIds.length > 0) {
              const rfResult = await ObjectLayerRenderFrames.deleteMany({ _id: { $in: renderFrameIds } });
              logger.info(`Dropped ${rfResult.deletedCount} ObjectLayerRenderFrames document(s)`);
            }

            if (cidsToUnpin.size > 0) {
              const ipfsResult = await Ipfs.deleteMany({ cid: { $in: [...cidsToUnpin] } });
              logger.info(`Dropped ${ipfsResult.deletedCount} Ipfs pin record(s)`);
            }

            let unpinCount = 0;
            for (const cid of cidsToUnpin) {
              const ok = await IpfsClient.unpinCid(cid);
              if (ok) unpinCount++;
            }
            let mfsCount = 0;
            for (const itemKey of itemKeysToClean) {
              const ok = await IpfsClient.removeMfsPath(`/object-layer/${itemKey}`);
              if (ok) mfsCount++;
            }
            logger.info(
              `IPFS cleanup: ${unpinCount}/${cidsToUnpin.size} CIDs unpinned, ${mfsCount}/${itemKeysToClean.size} MFS paths removed`,
            );

            const olResult = await ObjectLayer.deleteMany({ 'data.item.id': { $in: [...dropOlItemIds] } });
            logger.info(`Dropped ${olResult.deletedCount} ObjectLayer document(s)`);
          }

          // Drop thumbnail File documents (instance + maps), excluding shared ones
          if (thumbFileIds.length > 0) {
            const thumbResult = await File.deleteMany({ _id: { $in: thumbFileIds } });
            logger.info(`Dropped ${thumbResult.deletedCount} File document(s) (thumbnails)`);
          }

          await CyberiaInstance.deleteOne({ code: instanceCode });
          logger.info('Dropped CyberiaInstance', { code: instanceCode });
          await CyberiaInstanceConf.deleteOne({ instanceCode });
          logger.info('Dropped CyberiaInstanceConf', { instanceCode });
        } else {
          logger.info('No existing instance to drop', { code: instanceCode });
        }
      }

      if (options.export === undefined && options.import === undefined && !options.drop) {
        logger.error('Specify --export, --import, or --drop flag');
      }

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  // ── client-hints: presentation hints management ──────────────────────────
  program
    .command('client-hints [instance-code]')
    .option('--export [path]', 'Export CyberiaClientHints document to JSON (default: ./client-hints-<code>.json)')
    .option('--import [path]', 'Upsert CyberiaClientHints from a JSON file')
    .option('--seed-defaults', 'Upsert canonical presentation-hint defaults for the given instance code')
    .option('--drop', 'Remove the CyberiaClientHints document for the given instance code')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Manage per-instance client presentation hints (palette, camera, status icons, interpolation)')
    .action(async (instanceCode, options = {}) => {
      try {
        const envPath =
          options.envPath || `./engine-private/conf/dd-cyberia/.env.${options.dev ? 'development' : 'production'}`;
        if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

        const { CYBERIA_CLIENT_HINTS_DEFAULTS, buildClientHints } =
          await import('../src/client/components/cyberia/SharedDefaultsCyberia.js');

        const deployId = process.env.DEFAULT_DEPLOY_ID;
        const host = process.env.DEFAULT_DEPLOY_HOST;
        const path = process.env.DEFAULT_DEPLOY_PATH;
        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (!fs.existsSync(confServerPath)) throw new Error(`Config not found: ${confServerPath}`);
        const confServer = loadConfServerJson(confServerPath, { resolve: true });
        const { db } = confServer[host][path];
        db.host = options.mongoHost ? options.mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

        await DataBaseProviderService.load({ apis: ['cyberia-client-hints'], host, path, db });
        const CyberiaClientHints = DataBaseProviderService.getModel('cyberia-client-hints', { host, path });

        if (!instanceCode && !options.seedDefaults) {
          logger.error('instance-code required for client-hints operations (omit only with --seed-defaults on all)');
          process.exit(1);
        }

        if (options.drop) {
          if (!instanceCode) {
            logger.error('instance-code required for --drop');
            process.exit(1);
          }
          const result = await CyberiaClientHints.deleteOne({ code: instanceCode });
          logger.info(`client-hints --drop: removed ${result.deletedCount} document(s) for code="${instanceCode}"`);
        }

        if (options.seedDefaults) {
          const codes = instanceCode ? [instanceCode] : [];
          if (codes.length === 0) {
            logger.error('instance-code required for --seed-defaults');
            process.exit(1);
          }
          for (const code of codes) {
            await CyberiaClientHints.findOneAndUpdate(
              { code },
              { $setOnInsert: { code } },
              { upsert: true, returnDocument: 'after' },
            );
            logger.info(`client-hints --seed-defaults: seeded overrides shell for code="${code}"`);
          }
        }

        if (options.import) {
          const filePath = typeof options.import === 'string' ? options.import : `./client-hints-${instanceCode}.json`;
          if (!fs.existsSync(filePath)) throw new Error(`Import file not found: ${filePath}`);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const code = data.code || instanceCode;
          if (!code) {
            logger.error('instance-code required (from file.code or CLI argument)');
            process.exit(1);
          }
          await CyberiaClientHints.findOneAndUpdate({ code }, { $set: { code, ...data } }, { upsert: true, new: true });
          logger.info(`client-hints --import: upserted code="${code}" from ${filePath}`);
        }

        if (options.export) {
          if (!instanceCode) {
            logger.error('instance-code required for --export');
            process.exit(1);
          }
          const doc = await CyberiaClientHints.findOne({ code: instanceCode }).lean();
          if (!doc) {
            logger.warn(`No client-hints document found for code="${instanceCode}", exporting defaults`);
          }
          const outPath = typeof options.export === 'string' ? options.export : `./client-hints-${instanceCode}.json`;
          fs.writeFileSync(
            outPath,
            JSON.stringify(doc || { code: instanceCode, ...CYBERIA_CLIENT_HINTS_DEFAULTS }, null, 2),
          );
          logger.info(`client-hints --export: wrote ${outPath}`);
        }

        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      } catch (err) {
        logger.error('client-hints command error:', err);
        process.exit(1);
      }
    });

  // ── generate-saga: Top-Down PCG guided by LLMs (Semantic Reverse-Engineering) ──
  program
    .command('generate-saga')
    .option(
      '--prompt <theme>',
      'Theme seed for the saga. If omitted, a distinct theme is auto-generated from the Cyberia base lore',
    )
    .option('--import <file>', 'Load a previously generated payload file (the shape --out writes) into the database')
    .option('--model <model>', 'Gemini model id (default: gemma-4-26b-a4b-it)')
    .option('--timeout <ms>', 'Per-request timeout in ms (default: 300000)', (v) => parseInt(v, 10))
    .option('--thinking-level <level>', 'Gemini thinking level: low | medium | high (default: high)')
    .option(
      '--lore-path <path>',
      'Override path to the base-lore doc (default: src/client/public/cyberia-docs/CYBERIA-LORE.md)',
    )
    .option(
      '--space-context <context>',
      'Force the auto-theme spatial layer: physical | mixed | hyperspace (default: random ~33% each)',
    )
    .option(
      '--tone <tone>',
      'Force the auto-theme narrative type: adventure | politics | tragic | comedy (default: random ~25% each)',
    )
    .option(
      '--faction-context <keys>',
      'Comma-separated factions that DRIVE the auto-theme: zenith | nova | atlas | neutral ' +
        "(e.g. 'nova,zenith'). If unset, confederations stay background, not the main theme",
    )
    .option(
      '--character-context <keys>',
      'Comma-separated CHARACTER_NAMES_POOL keys to inspire NPC/character names: low_level_synthetics | ' +
        'high_fidelity_synthetics | global_latin_diaspora | east_asian_pacific_diaspora | ' +
        'middle_eastern_turkish_diaspora | sub_saharan_african_diaspora | classic_western_scifi | ' +
        'mutagen_clans (inspiration only). If unset, a random subset is chosen',
    )
    .option(
      '--cultural-exposure <mode>',
      'Naming diversity mode: cosmopolitan (high mixing) | local (isolated, consistent). ' +
        'If unset, chosen at random',
    )
    .option(
      '--temperature <value>',
      'Model sampling temperature, valid range 0.0 (deterministic) to 2.0 (most creative); ' +
        'higher = more creative/divergent (default: 2.0 for theme synthesis)',
      parseFloat,
    )
    .option('--out <file>', 'Path to dump the payload JSON (default: ./engine-private/cyberia-sagas/<saga-code>.json)')
    .option('--dry-run', 'Generate and normalize without writing to the database')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Generate (via Google Gemini) or import the non-spatial textual layer of a CyberiaSaga ecosystem')
    .action(async (options) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      let models = null;
      let host;
      let path;

      if (!options.dryRun) {
        const deployId = process.env.DEFAULT_DEPLOY_ID;
        host = process.env.DEFAULT_DEPLOY_HOST;
        path = process.env.DEFAULT_DEPLOY_PATH;

        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (!fs.existsSync(confServerPath)) {
          logger.error(`Server config not found: ${confServerPath}`);
          process.exit(1);
        }
        const confServer = loadConfServerJson(confServerPath, { resolve: true });
        const { db } = confServer[host][path];

        db.host = options.mongoHost
          ? options.mongoHost
          : options.dev
            ? db.host
            : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

        logger.info('generate-saga', { deployId, host, path, db });

        await DataBaseProviderService.load({
          apis: [
            'cyberia-saga',
            'cyberia-map',
            'cyberia-quest',
            'cyberia-dialogue',
            'cyberia-action',
            'cyberia-skill',
            'cyberia-instance',
            'object-layer',
          ],
          host,
          path,
          db,
        });

        models = {
          CyberiaSaga: DataBaseProviderService.getModel('cyberia-saga', { host, path }),
          CyberiaMap: DataBaseProviderService.getModel('cyberia-map', { host, path }),
          CyberiaQuest: DataBaseProviderService.getModel('cyberia-quest', { host, path }),
          CyberiaDialogue: DataBaseProviderService.getModel('cyberia-dialogue', { host, path }),
          CyberiaAction: DataBaseProviderService.getModel('cyberia-action', { host, path }),
          CyberiaSkill: DataBaseProviderService.getModel('cyberia-skill', { host, path }),
          CyberiaInstance: DataBaseProviderService.getModel('cyberia-instance', { host, path }),
          ObjectLayer: DataBaseProviderService.getModel('object-layer', { host, path }),
        };
      }

      try {
        if (options.import) {
          await importSaga({
            file: options.import,
            models,
            dryRun: !!options.dryRun,
            out: options.out,
          });
        } else {
          await generateSaga({
            prompt: options.prompt,
            models,
            model: options.model,
            timeout: options.timeout,
            thinkingLevel: options.thinkingLevel,
            lorePath: options.lorePath,
            spaceContext: options.spaceContext,
            tone: options.tone,
            factionContext: options.factionContext,
            characterContext: options.characterContext,
            culturalExposure: options.culturalExposure,
            temperature: options.temperature,
            dryRun: !!options.dryRun,
            out: options.out,
          });
        }
      } catch (err) {
        logger.error('generate-saga command error:', err);
        process.exitCode = 1;
      } finally {
        if (models) await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      }
    });

  // ── chain: Hyperledger Besu / ERC-1155 lifecycle commands ────────────────
  const chain = program.command('chain').description('Hyperledger Besu chain & ERC-1155 ObjectLayerToken lifecycle');

  chain
    .command('deploy')
    .description(
      'Deploy Besu IBFT2 network to kubeadm Kubernetes cluster.\n' +
        'Dynamically generates fresh validator keys, genesis, extraData, enode URLs,\n' +
        'and all K8s manifests in manifests/besu/ before applying via kustomize.\n' +
        'Each invocation creates a unique chain identity (new keys, new extraData).',
    )
    .option('--pull-image', 'Pull Besu container images into containerd before deployment')
    .option('--validators <count>', 'Number of IBFT2 validators (default: 4)', '4')
    .option('--chain-id <chainId>', 'Chain ID for the network (default: 777771)', '777771')
    .option('--block-period <seconds>', 'IBFT2 block period in seconds (default: 5)', '5')
    .option('--epoch-length <length>', 'IBFT2 epoch length (default: 30000)', '30000')
    .option('--coinbase-address <address>', 'Coinbase deployer address (auto-detected from engine-private if omitted)')
    .option('--besu-image <image>', 'Besu container image', 'hyperledger/besu:24.12.1')
    .option('--curl-image <image>', 'Curl init container image', 'curlimages/curl:8.11.1')
    .option('--node-port-rpc <port>', 'NodePort for external JSON-RPC access', '30545')
    .option('--node-port-ws <port>', 'NodePort for external WebSocket access', '30546')
    .option('--namespace <ns>', 'Kubernetes namespace for Besu resources', 'besu')
    .option('--skip-generate', 'Skip manifest generation and use existing manifests/besu/ as-is')
    .option('--skip-wait', 'Skip waiting for validators to reach Running state')
    .action(async (options) => {
      const result = await deployBesu({
        pullImage: !!options.pullImage,
        validators: parseInt(options.validators, 10),
        chainId: parseInt(options.chainId, 10),
        blockPeriodSeconds: parseInt(options.blockPeriod, 10),
        epochLength: parseInt(options.epochLength, 10),
        coinbaseAddress: options.coinbaseAddress || '',
        besuImage: options.besuImage,
        curlImage: options.curlImage,
        nodePortRpc: parseInt(options.nodePortRpc, 10),
        nodePortWs: parseInt(options.nodePortWs, 10),
        namespace: options.namespace,
        skipGenerate: !!options.skipGenerate,
        skipWait: !!options.skipWait,
        manifestsPath: './manifests/besu',
        networkConfigDir: './hardhat/networks',
        privateKeysDir: './engine-private/eth-networks/besu/validators',
      });
      if (!result && !options.skipGenerate) {
        process.exit(1);
      }
    });

  chain
    .command('remove')
    .description('Remove Besu IBFT2 network from kubeadm Kubernetes cluster')
    .option('--namespace <ns>', 'Kubernetes namespace for Besu resources', 'besu')
    .option('--clean-keys', 'Also remove generated validator keys from engine-private/')
    .option('--clean-manifests', 'Also remove the generated manifests/besu/ directory')
    .action(async (options) => {
      removeBesu({
        namespace: options.namespace,
        cleanKeys: !!options.cleanKeys,
        cleanManifests: !!options.cleanManifests,
        manifestsPath: './manifests/besu',
        privateKeysDir: './engine-private/eth-networks/besu/validators',
      });
    });

  chain
    .command('generate-manifests')
    .description(
      'Generate fresh Besu IBFT2 K8s manifests without deploying.\n' +
        'Creates new validator keys, genesis, extraData, and all manifest files\n' +
        'in manifests/besu/. Use "cyberia chain deploy --skip-generate" to apply them later.',
    )
    .option('--validators <count>', 'Number of IBFT2 validators (default: 4)', '4')
    .option('--chain-id <chainId>', 'Chain ID for the network (default: 777771)', '777771')
    .option('--block-period <seconds>', 'IBFT2 block period in seconds (default: 5)', '5')
    .option('--epoch-length <length>', 'IBFT2 epoch length (default: 30000)', '30000')
    .option('--coinbase-address <address>', 'Coinbase deployer address (auto-detected from engine-private if omitted)')
    .option('--besu-image <image>', 'Besu container image', 'hyperledger/besu:24.12.1')
    .option('--curl-image <image>', 'Curl init container image', 'curlimages/curl:8.11.1')
    .option('--node-port-rpc <port>', 'NodePort for external JSON-RPC access', '30545')
    .option('--node-port-ws <port>', 'NodePort for external WebSocket access', '30546')
    .option('--namespace <ns>', 'Kubernetes namespace for Besu resources', 'besu')
    .option('--output-dir <dir>', 'Output directory for manifests', './manifests/besu')
    .action(async (options) => {
      try {
        const result = await generateBesuManifests({
          outputDir: options.outputDir,
          networkConfigDir: './hardhat/networks',
          validatorCount: parseInt(options.validators, 10),
          namespace: options.namespace,
          chainId: parseInt(options.chainId, 10),
          blockPeriodSeconds: parseInt(options.blockPeriod, 10),
          epochLength: parseInt(options.epochLength, 10),
          requestTimeoutSeconds: 10,
          coinbaseAddress: options.coinbaseAddress || '',
          besuImage: options.besuImage,
          curlImage: options.curlImage,
          nodePortRpc: parseInt(options.nodePortRpc, 10),
          nodePortWs: parseInt(options.nodePortWs, 10),
          savePrivateKeys: true,
          privateKeysDir: './engine-private/eth-networks/besu/validators',
        });
        logger.info('');
        logger.info('Manifests generated successfully. To deploy:');
        logger.info('  cyberia chain deploy --skip-generate');
        logger.info('');
        logger.info('Validator summary:');
        for (const v of result.validators) {
          logger.info(`  Validator ${v.index}: address=${v.address} pubkey=${v.publicKey.slice(0, 16)}...`);
        }
      } catch (err) {
        logger.error(`Manifest generation failed: ${err.message}`);
        process.exit(1);
      }
    });

  chain
    .command('deploy-contract')
    .description('Deploy ObjectLayerToken (ERC-1155) contract to a Besu network via Hardhat')
    .option('--network <network>', 'Hardhat network name (besu-k8s for kubeadm cluster)', 'besu-k8s')
    .action(async (options) => {
      const network = options.network || 'besu-k8s';
      logger.info(`Deploying ObjectLayerToken to network: ${network}`);
      shellExec(`cd hardhat && npx hardhat run scripts/deployObjectLayerToken.js --network ${network}`);
      logger.info('Contract deployment complete. Check hardhat/deployments/ for the artifact.');
    });

  chain
    .command('compile')
    .description('Compile Solidity contracts via Hardhat')
    .action(async () => {
      logger.info('Compiling contracts...');
      shellExec('cd hardhat && npx hardhat compile');
      logger.info('Compilation complete.');
    });

  chain
    .command('test')
    .description('Run Hardhat tests for ObjectLayerToken')
    .action(async () => {
      logger.info('Running ObjectLayerToken tests...');
      shellExec('cd hardhat && npx hardhat test test/ObjectLayerToken.js');
    });

  chain
    .command('register')
    .description(
      'Register an Object Layer item on-chain via the deployed ObjectLayerToken contract.\n' +
        'When --from-db is set the canonical CID is resolved from MongoDB (fast-json-stable-stringify of objectLayer.data).\n' +
        'This guarantees the on-chain metadataCid always matches the content-addressed IPFS payload.',
    )
    .requiredOption('--item-id <itemId>', 'Human-readable item identifier (e.g. "hatchet")')
    .option('--metadata-cid <cid>', 'IPFS metadata CID for the item (ignored when --from-db is set)', '')
    .option('--from-db', 'Resolve the canonical CID from the ObjectLayer MongoDB document (recommended)')
    .option('--supply <supply>', 'Initial token supply (1 = non-fungible, >1 = semi-fungible)', '1')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override (used with --from-db)')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      // ── Resolve canonical CID ───────────────────────────────────────
      let canonicalCid = options.metadataCid || '';

      if (options.fromDb) {
        try {
          const { ObjectLayer, host, path } = await connectDbForChain({
            envPath: options.envPath,
            mongoHost: options.mongoHost,
          });
          const resolved = await resolveCanonicalCid({
            itemId: options.itemId,
            ObjectLayer,
            ipfsClient: IpfsClient,
            options: { host, path },
          });

          if (options.metadataCid && options.metadataCid !== resolved.cid) {
            logger.warn(
              `Provided --metadata-cid "${options.metadataCid}" differs from canonical CID "${resolved.cid}" (source: ${resolved.source}).`,
            );
            logger.warn('Using the canonical CID to ensure on-chain integrity.');
          }

          canonicalCid = resolved.cid;
          logger.info(`Canonical CID resolved (${resolved.source}): ${canonicalCid}`);
          logger.info(`  SHA-256: ${resolved.sha256}`);

          // Close the DB connection after resolving
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
        } catch (dbErr) {
          logger.error(`Failed to resolve canonical CID from database: ${dbErr.message}`);
          process.exit(1);
        }
      } else if (!canonicalCid) {
        logger.warn(
          'No --metadata-cid provided and --from-db not set. The on-chain metadataCid will be empty.\n' +
            'Consider using --from-db to automatically resolve the canonical CID from the database.',
        );
      }

      logger.info(`Registering Object Layer item "${options.itemId}" on contract ${contractAddress}`);
      logger.info(`  Metadata CID: ${canonicalCid || '(none)'}`);
      logger.info(`  Supply: ${options.supply}`);

      // Use a Hardhat script via inline JS to call registerObjectLayer
      const registerScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const [deployer] = await ethers.getSigners();
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const tx = await token.registerObjectLayer(
            deployer.address,
            '${options.itemId}',
            '${canonicalCid}',
            ${options.supply},
            '0x'
          );
          const receipt = await tx.wait();
          const tokenId = await token.computeTokenId('${options.itemId}');
          console.log('Registered tokenId:', tokenId.toString());
          console.log('Tx hash:', receipt.hash);
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_register_tmp.js';
      fs.writeFileSync(tmpScript, registerScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_register_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  chain
    .command('mint')
    .description('Mint additional tokens for an existing token ID')
    .requiredOption('--token-id <tokenId>', 'ERC-1155 token ID (uint256)')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <amount>', 'Amount to mint')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      logger.info(`Minting ${options.amount} of token ID ${options.tokenId} to ${options.to}`);

      const mintScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const tx = await token.mint('${options.to}', ${options.tokenId}, ${options.amount}, '0x');
          const receipt = await tx.wait();
          console.log('Mint tx hash:', receipt.hash);
          const balance = await token.balanceOf('${options.to}', ${options.tokenId});
          console.log('New balance:', balance.toString());
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_mint_tmp.js';
      fs.writeFileSync(tmpScript, mintScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_mint_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  chain
    .command('status')
    .description('Query Besu chain and ObjectLayerToken contract status')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;

      logger.info('── Besu Chain Status ──');

      // Check node connectivity
      const statusScript = `
        import hre from 'hardhat';
        import { readFileSync } from 'fs';
        const { ethers } = await hre.network.connect();
        async function main() {
          const provider = ethers.provider;
          const network = await provider.getNetwork();
          const blockNumber = await provider.getBlockNumber();
          const [deployer] = await ethers.getSigners();
          const balance = await provider.getBalance(deployer.address);
          console.log('Network:', JSON.stringify({
            name: network.name,
            chainId: network.chainId.toString(),
            blockNumber,
            deployerAddress: deployer.address,
            deployerBalance: ethers.formatEther(balance) + ' ETH'
          }, null, 2));

          ${
            fs.existsSync(artifactPath)
              ? `
          const deployment = JSON.parse(readFileSync('${nodePath.resolve(artifactPath)}', 'utf8'));
          try {
            const token = await ethers.getContractAt('ObjectLayerToken', deployment.address);
            const cryptokoynSupply = await token['totalSupply(uint256)'](0);
            const deployerCKY = await token.balanceOf(deployer.address, 0);
            const isPaused = false; // pausable check would need try-catch
            console.log('Contract:', JSON.stringify({
              address: deployment.address,
              cryptokoynTotalSupply: ethers.formatEther(cryptokoynSupply) + ' CKY',
              deployerCryptokoynBalance: ethers.formatEther(deployerCKY) + ' CKY',
            }, null, 2));
          } catch (e) {
            console.log('Contract not accessible:', e.message);
          }
          `
              : `console.log('No deployment artifact found for network ${options.network}.');`
          }
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_status_tmp.js';
      fs.writeFileSync(tmpScript, statusScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_status_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  chain
    .command('pause')
    .description('Pause all token transfers on the ObjectLayerToken contract (emergency governance)')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .action(async (options) => {
      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      const pauseScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${deployment.address}');
          const tx = await token.pause();
          await tx.wait();
          console.log('Contract PAUSED. All transfers are frozen.');
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_pause_tmp.js';
      fs.writeFileSync(tmpScript, pauseScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_pause_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  chain
    .command('unpause')
    .description('Unpause token transfers on the ObjectLayerToken contract')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .action(async (options) => {
      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      const unpauseScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${deployment.address}');
          const tx = await token.unpause();
          await tx.wait();
          console.log('Contract UNPAUSED. Transfers resumed.');
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_unpause_tmp.js';
      fs.writeFileSync(tmpScript, unpauseScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_unpause_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  // ── key-gen: Generate Ethereum secp256k1 key pair ───────────────────────
  chain
    .command('key-gen')
    .description('Generate a new Ethereum secp256k1 key pair for player identity or deployer accounts')
    .option(
      '--save',
      'Persist key files to default paths (private → ./engine-private/, public → ./hardhat/deployments/)',
    )
    .option('--private-path <path>', 'Custom path for the private key JSON file (overrides default)')
    .option('--public-path <path>', 'Custom path for the public key JSON file (overrides default)')
    .action(async (options) => {
      const { ethers } = await import('ethers');
      const wallet = ethers.Wallet.createRandom();

      const addressLower = wallet.address.toLowerCase();

      const privateData = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic ? wallet.mnemonic.phrase : null,
      };

      const publicData = {
        address: wallet.address,
        publicKey: wallet.publicKey,
      };

      logger.info('── New Ethereum Key Pair ──');
      logger.info(`  Address    : ${wallet.address}`);
      logger.info(`  Private Key: ${wallet.privateKey}`);
      logger.info(`  Public Key : ${wallet.publicKey}`);
      if (privateData.mnemonic) {
        logger.info(`  Mnemonic   : ${privateData.mnemonic}`);
      }

      const shouldSave = options.save || options.privatePath || options.publicPath;

      if (shouldSave) {
        const privatePath = options.privatePath || `./engine-private/eth-networks/besu/${addressLower}.key.json`;
        const publicPath = options.publicPath || `./hardhat/deployments/${addressLower}.pub.json`;

        fs.ensureDirSync(nodePath.dirname(privatePath));
        fs.writeJsonSync(privatePath, privateData, { spaces: 2 });
        logger.info(`  Private key saved to: ${privatePath}`);
        logger.warn('  ⚠  Keep this file secure! Anyone with the private key controls this address.');

        fs.ensureDirSync(nodePath.dirname(publicPath));
        fs.writeJsonSync(publicPath, publicData, { spaces: 2 });
        logger.info(`  Public key saved to : ${publicPath}`);
      }
    });

  // ── set-coinbase: Set the Besu deployer (coinbase) private key ──────────
  chain
    .command('set-coinbase')
    .description(
      'Set the coinbase deployer private key used by hardhat.config.js for Besu network deployments.\n' +
        'Accepts either a raw hex private key via --private-key, or a .key.json file generated by "cyberia chain key-gen --save" via --from-file.',
    )
    .option('--private-key <hex>', 'Raw hex private key (with or without 0x prefix)')
    .option(
      '--from-file <path>',
      'Path to a .key.json file (e.g. ./engine-private/eth-networks/besu/<address>.key.json)',
    )
    .option(
      '--coinbase-path <path>',
      'Custom output path for the coinbase file',
      './engine-private/eth-networks/besu/coinbase',
    )
    .action(async (options) => {
      let privateKey;

      if (options.fromFile) {
        if (!fs.existsSync(options.fromFile)) {
          logger.error(`Key file not found: ${options.fromFile}`);
          process.exit(1);
        }
        try {
          const keyData = fs.readJsonSync(options.fromFile);
          if (!keyData.privateKey) {
            logger.error(`Key file does not contain a "privateKey" field: ${options.fromFile}`);
            process.exit(1);
          }
          privateKey = keyData.privateKey;
          logger.info(`Read private key for address ${keyData.address || '(unknown)'} from ${options.fromFile}`);
        } catch (e) {
          logger.error(`Failed to parse key file: ${e.message}`);
          process.exit(1);
        }
      } else if (options.privateKey) {
        privateKey = options.privateKey;
      } else {
        logger.error('Provide either --private-key <hex> or --from-file <path>.');
        process.exit(1);
      }

      // Normalise: ensure 0x prefix
      privateKey = privateKey.trim();
      if (!privateKey.startsWith('0x')) privateKey = `0x${privateKey}`;

      // Validate the key by deriving the address
      try {
        const { ethers } = await import('ethers');
        const wallet = new ethers.Wallet(privateKey);
        logger.info(`  Derived address: ${wallet.address}`);
      } catch (e) {
        logger.error(`Invalid private key: ${e.message}`);
        process.exit(1);
      }

      // Write the coinbase file
      const coinbasePath = options.coinbasePath;
      fs.ensureDirSync(nodePath.dirname(coinbasePath));
      fs.writeFileSync(coinbasePath, privateKey, 'utf8');
      logger.info(`Coinbase private key written to: ${coinbasePath}`);
      logger.warn('⚠  Keep this file secure! Anyone with the private key controls the deployer address.');
      logger.info('hardhat.config.js will read this file automatically for Besu network deployments.');
    });

  // ── balance: Query token balance for an address ─────────────────────────
  chain
    .command('balance')
    .description('Query ERC-1155 token balance for an address (CKY fungible, semi-fungible, or non-fungible)')
    .requiredOption('--address <address>', 'Ethereum address to query')
    .option('--token-id <tokenId>', 'ERC-1155 token ID (default: 0 = CKY)', '0')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      const balanceScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const balance = await token.balanceOf('${options.address}', ${options.tokenId});
          const itemId = await token.getItemId(${options.tokenId});
          const metadataCid = await token.getMetadataCID(${options.tokenId});
          let totalSupply;
          try { totalSupply = await token['totalSupply(uint256)'](${options.tokenId}); } catch (_) { totalSupply = 'N/A'; }
          console.log(JSON.stringify({
            address: '${options.address}',
            tokenId: '${options.tokenId}',
            itemId: itemId || '(unregistered)',
            balance: balance.toString(),
            formattedBalance: ${options.tokenId} === '0' || ${options.tokenId} === 0 ? ethers.formatEther(balance) + ' CKY' : balance.toString() + ' units',
            totalSupply: totalSupply.toString(),
            metadataCid: metadataCid || '(none)',
          }, null, 2));
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_balance_tmp.js';
      fs.writeFileSync(tmpScript, balanceScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_balance_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  // ── transfer: Transfer ERC-1155 tokens between addresses ────────────────
  chain
    .command('transfer')
    .description('Transfer ERC-1155 tokens (CKY, semi-fungible resources, or non-fungible items)')
    .requiredOption('--from <address>', 'Sender address (must be the deployer/owner for relayed transfers)')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--token-id <tokenId>', 'ERC-1155 token ID (0 = CKY)')
    .requiredOption('--amount <amount>', 'Amount to transfer')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      logger.info(
        `Transferring ${options.amount} of token ID ${options.tokenId} from ${options.from} to ${options.to}`,
      );

      const transferScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const [signer] = await ethers.getSigners();
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const tx = await token.safeTransferFrom(
            '${options.from}',
            '${options.to}',
            ${options.tokenId},
            ${options.amount},
            '0x'
          );
          const receipt = await tx.wait();
          console.log('Transfer tx hash:', receipt.hash);
          const senderBal = await token.balanceOf('${options.from}', ${options.tokenId});
          const recipientBal = await token.balanceOf('${options.to}', ${options.tokenId});
          console.log('Sender balance:', senderBal.toString());
          console.log('Recipient balance:', recipientBal.toString());
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_transfer_tmp.js';
      fs.writeFileSync(tmpScript, transferScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_transfer_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  // ── burn: Burn ERC-1155 tokens ──────────────────────────────────────────
  chain
    .command('burn')
    .description(
      'Burn ERC-1155 tokens (CKY to reduce supply, semi-fungible for crafting cost, non-fungible to destroy)',
    )
    .requiredOption('--address <address>', 'Address holding the tokens to burn')
    .requiredOption('--token-id <tokenId>', 'ERC-1155 token ID (0 = CKY)')
    .requiredOption('--amount <amount>', 'Amount to burn')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      logger.info(`Burning ${options.amount} of token ID ${options.tokenId} from ${options.address}`);

      const burnScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const tx = await token.burn('${options.address}', ${options.tokenId}, ${options.amount});
          const receipt = await tx.wait();
          console.log('Burn tx hash:', receipt.hash);
          const remaining = await token.balanceOf('${options.address}', ${options.tokenId});
          console.log('Remaining balance:', remaining.toString());
          let totalSupply;
          try { totalSupply = await token['totalSupply(uint256)'](${options.tokenId}); } catch (_) { totalSupply = 'N/A'; }
          console.log('Total supply after burn:', totalSupply.toString());
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_burn_tmp.js';
      fs.writeFileSync(tmpScript, burnScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_burn_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  // ── batch-register: Register multiple Object Layer items in one tx ──────
  chain
    .command('batch-register')
    .description(
      'Batch-register multiple Object Layer items on-chain in a single transaction.\n' +
        'When --from-db is set, the canonical CID for every item is resolved from MongoDB\n' +
        '(fast-json-stable-stringify of objectLayer.data), overriding any "cid" values in the JSON input.',
    )
    .requiredOption('--items <json>', 'JSON array of items: [{"itemId":"wood","cid":"bafk...","supply":500000}, ...]')
    .option('--from-db', 'Resolve canonical CIDs from the ObjectLayer MongoDB documents (recommended)')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override (used with --from-db)')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      let items;
      try {
        items = JSON.parse(options.items);
        if (!Array.isArray(items) || items.length === 0) throw new Error('Must be a non-empty array');
      } catch (e) {
        logger.error(`Invalid --items JSON: ${e.message}`);
        process.exit(1);
      }

      const deploymentsDir = './hardhat/deployments';
      const artifactPath = `${deploymentsDir}/${options.network}-ObjectLayerToken.json`;
      if (!fs.existsSync(artifactPath)) {
        logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
        process.exit(1);
      }
      const deployment = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const contractAddress = deployment.address;

      // ── Resolve canonical CIDs when --from-db is set ────────────────
      if (options.fromDb) {
        let ObjectLayer, host, path;
        try {
          ({ ObjectLayer, host, path } = await connectDbForChain({
            envPath: options.envPath,
            mongoHost: options.mongoHost,
          }));
        } catch (dbErr) {
          logger.error(`Failed to connect to database: ${dbErr.message}`);
          process.exit(1);
        }

        for (const item of items) {
          try {
            const resolved = await resolveCanonicalCid({
              itemId: item.itemId,
              ObjectLayer,
              ipfsClient: IpfsClient,
              options: { host, path },
            });

            if (item.cid && item.cid !== resolved.cid) {
              logger.warn(
                `Item "${item.itemId}": provided cid "${item.cid}" differs from canonical "${resolved.cid}" (${resolved.source}). Using canonical.`,
              );
            }

            item.cid = resolved.cid;
            logger.info(`  "${item.itemId}" canonical CID (${resolved.source}): ${resolved.cid}`);
          } catch (resolveErr) {
            logger.error(`Failed to resolve canonical CID for "${item.itemId}": ${resolveErr.message}`);
            process.exit(1);
          }
        }

        try {
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
        } catch (_) {
          /* ignore close errors */
        }
      }

      const itemIds = items.map((i) => i.itemId);
      const cids = items.map((i) => i.cid || '');
      const supplies = items.map((i) => i.supply || 1);

      logger.info(`Batch-registering ${items.length} items on contract ${contractAddress}`);
      for (const item of items) {
        logger.info(`  - ${item.itemId} (supply: ${item.supply || 1}, cid: ${item.cid || '(none)'})`);
      }

      const batchScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const [deployer] = await ethers.getSigners();
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const itemIds = ${JSON.stringify(itemIds)};
          const cids = ${JSON.stringify(cids)};
          const supplies = ${JSON.stringify(supplies)};
          const tx = await token.batchRegisterObjectLayers(
            deployer.address,
            itemIds,
            cids,
            supplies,
            '0x'
          );
          const receipt = await tx.wait();
          console.log('Batch register tx hash:', receipt.hash);
          for (const id of itemIds) {
            const tokenId = await token.computeTokenId(id);
            const balance = await token.balanceOf(deployer.address, tokenId);
            console.log('  ' + id + ' -> tokenId:', tokenId.toString(), '  balance:', balance.toString());
          }
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_batch_register_tmp.js';
      fs.writeFileSync(tmpScript, batchScript, 'utf8');
      try {
        shellExec(`cd hardhat && npx hardhat run scripts/_cli_batch_register_tmp.js --network ${options.network}`);
      } finally {
        fs.removeSync(tmpScript);
      }
    });

  const runner = program.command('run-workflow').description('Run a Cyberia script from the "scripts" directory');

  runner
    .command('import-default-items')
    .option('--dev', 'Force development environment (loads .env.development for IPFS localhost, etc.)')
    .option(
      '--mongo-host <mongo-host>',
      'Mongo host override (forwarded to ol, seed-skills, seed-entities, seed-dialogues, seed-actions-quests, client-hints)',
    )
    .option('--clean', 'Clean the database before importing')
    .description(
      'Import default Object Layer items, skills, entity defaults, dialogues, actions/quests, and client-hints into MongoDB',
    )
    .action(async (options) => {
      // Pre-flight: every item id referenced by the fallback world must
      // exist in DefaultCyberiaItems. Drift here causes silent missing
      // sprites at runtime, so fail loudly before we touch MongoDB.
      const { auditFallbackItemIds } = await import('../src/api/cyberia-instance/cyberia-fallback-world.js');
      const missing = auditFallbackItemIds();
      if (missing.length > 0) {
        logger.error(
          'import-default-items aborted: item ids referenced by defaults are missing from DefaultCyberiaItems:',
          missing.join(', '),
          '— add them to cyberia-server-defaults.js before seeding.',
        );
        process.exit(1);
      }

      const devFlag = options.dev ? ' --dev' : '';
      const mongoHostFlag = options.mongoHost ? ` --mongo-host ${options.mongoHost}` : '';
      const instanceHintsCode = process.env.INSTANCE_CODE || 'cyberia-main';
      const sagaCode = 'amethyst-strata-expansion';
      if (options.clean) {
        shellExec(`node bin/cyberia ol --drop${devFlag}${mongoHostFlag}`);
        shellExec(`node bin/cyberia run-workflow drop-db${devFlag}${mongoHostFlag}`);
        return;
      }
      shellExec(
        `node bin/cyberia generate-saga --import engine-private/cyberia-sagas/${sagaCode}.json${devFlag}${mongoHostFlag}`,
      );
      shellExec(`node bin/cyberia ol ${DefaultCyberiaItems.map((e) => e.item.id)} --import${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-skills${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-entities${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-dialogues${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-actions-quests${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia client-hints ${instanceHintsCode} --seed-defaults${devFlag}${mongoHostFlag}`);
      shellExec(`node bin/cyberia instance ${sagaCode} --import${devFlag}`);
      shellExec(`node bin/cyberia instance FOREST --import${devFlag}`);
    });

  runner.command('sync-src').action(() => {
    fs.copyFileSync('./cyberia-server/README.md', './src/client/public/cyberia-docs/CYBERIA-SERVER.md');
    fs.copyFileSync('./cyberia-server/Dockerfile', './src/runtime/cyberia-server/Dockerfile');
    fs.copyFileSync('./cyberia-client/README.md', './src/client/public/cyberia-docs/CYBERIA-CLIENT.md');
    fs.copyFileSync('./cyberia-client/Dockerfile', './src/runtime/cyberia-client/Dockerfile');
  });

  runner
    .command('dev-env')
    .option('--run', 'Run docker:reset, cluster --dev --reset, docker-image, and docker:up after updating compose.env')
    .option(
      '--clean',
      'Restore repositories to canonical state (git checkout Dockerfile, etc.) before updating compose.env',
    )
    .option('--reset', 'Reset the development environment before updating compose.env')
    .action((options) => {
      if (options.reset) {
        shellExec('node bin/cyberia run-workflow docker:reset');
        shellExec('node bin cluster --dev --reset');
        return;
      }
      if (options.clean) {
        shellExec(`node bin run clean`);
        shellExec(`node bin run clean ./cyberia-server`);
        shellExec(`node bin run clean ./cyberia-client`);
        return;
      }
      const envPath = `./engine-private/conf/dd-cyberia/docker-compose/cyberia/compose.env`;
      const canonicalDevDockerfile = './src/runtime/engine-cyberia/Dockerfile.dev';
      fs.writeFileSync(
        canonicalDevDockerfile,
        fs
          .readFileSync(canonicalDevDockerfile, 'utf8')
          .replace('ENGINE_CYBERIA_REPO="engine-cyberia"', 'ENGINE_CYBERIA_REPO="engine-test-cyberia"')
          .replace(`    # --mount=type=secret,id=github_token`, `    --mount=type=secret,id=github_token`)
          .replace(
            `    # export GITHUB_TOKEN="$(cat /run/secrets/github_token)";`,
            `    export GITHUB_TOKEN="$(cat /run/secrets/github_token)";`,
          )
          .replace(`    for _secret in "$GITHUB_USERNAME"; do`, `    # for _secret in "$GITHUB_USERNAME"; do`)
          .replace(`    unset GITHUB_USERNAME;`, `    # unset GITHUB_USERNAME;`)
          .replace(
            `    # for _secret in "$GITHUB_USERNAME" "$GITHUB_TOKEN"; do`,
            `    for _secret in "$GITHUB_USERNAME" "$GITHUB_TOKEN"; do`,
          )
          .replace(`    # unset GITHUB_TOKEN GITHUB_USERNAME;`, `    unset GITHUB_TOKEN GITHUB_USERNAME;`),

        'utf8',
      );
      fs.writeFileSync(
        './src/cli/image.js',
        fs
          .readFileSync('./src/cli/image.js', 'utf8')
          .replace(
            `      // addBuildSecret('github_token', process.env.GITHUB_TOKEN);`,
            `      addBuildSecret('github_token', process.env.GITHUB_TOKEN);`,
          ),
        'utf8',
      );
      fs.writeFileSync(
        envPath,
        fs
          .readFileSync(envPath, 'utf8')
          .replaceAll('underpost/', 'localhost/')
          .replaceAll('TAG=latest', 'TAG=' + Underpost.version),
        'utf8',
      );
      if (options.run) {
        shellExec('node bin/cyberia run-workflow dev-env --reset');
        shellExec('node bin/cyberia run-workflow docker-image engine-cyberia');
        shellExec('node bin/cyberia run-workflow docker-image cyberia-server');
        shellExec('node bin/cyberia run-workflow docker-image cyberia-client');
        shellExec('node bin/cyberia run-workflow docker:up');
      }
    });

  runner
    .command('drop-db')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Drop all Cyberia collections and remove File documents referenced by instance/map thumbnails')
    .action(async (options = {}) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('drop-db', { deployId, host, path, db });

      const cyberiaCollections = [
        'cyberia-entity',
        'cyberia-map',
        'cyberia-instance',
        'cyberia-instance-conf',
        'cyberia-dialogue',
        'cyberia-quest',
        'cyberia-quest-progress',
        'cyberia-action',
        'cyberia-skill',
        'cyberia-entity-type-default',
        'cyberia-client-hints',
        'cyberia-saga',
      ];

      await DataBaseProviderService.load({ apis: [...cyberiaCollections, 'file'], host, path, db });

      const File = DataBaseProviderService.getModel('file', { host, path });

      // Thumbnails/previews on instances/maps are File _id references; collect
      // them before dropping so the backing File documents don't leak as orphans.
      const thumbnailFileIds = new Set();
      for (const api of ['cyberia-instance', 'cyberia-map']) {
        const Model = DataBaseProviderService.getModel(api, { host, path });
        const docs = await Model.find(
          { $or: [{ thumbnail: { $ne: null } }, { preview: { $ne: null } }] },
          { thumbnail: 1, preview: 1 },
        ).lean();
        for (const doc of docs) {
          if (doc.thumbnail) thumbnailFileIds.add(doc.thumbnail.toString());
          if (doc.preview) thumbnailFileIds.add(doc.preview.toString());
        }
      }

      if (thumbnailFileIds.size > 0) {
        const result = await File.deleteMany({ _id: { $in: [...thumbnailFileIds] } });
        logger.info(`Removed ${result.deletedCount} thumbnail File document(s)`);
      }

      for (const api of cyberiaCollections) {
        const Model = DataBaseProviderService.getModel(api, { host, path });
        const result = await Model.deleteMany();
        logger.info(`Dropped ${result.deletedCount} ${api} document(s)`);
      }

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  const dockerImageIds = ['engine-cyberia', 'cyberia-server', 'cyberia-client'];

  runner.command('deploy [id]').action((id) => {
    if (!dockerImageIds.includes(id)) {
      logger.error(`Invalid deploy id: ${id}. Must be one of: ${dockerImageIds.join(', ')}`);
      process.exit(1);
    }
    shellExec(`gh workflow run ${id}.cd.yml -R underpostnet/${id} -f job=deploy`);
  });

  runner
    .command('docker-image [id]')
    .option('--load-tar', 'Load a pre-built image tar archive into the enabled target(s) without building.')
    .action((id, options) => {
      // no funca
      if (options.loadTar) {
        for (const imageId of dockerImageIds)
          if (imageId === id || id === '.') shellExec(`docker load -i ./${imageId}-dev_v3.2.70.tar`);
        return;
      }
      switch (id) {
        case 'engine-cyberia':
          shellExec(`clear
node bin/build dd-cyberia --conf
node bin/build dd-cyberia --update-private
node bin image --path src/runtime/engine-cyberia \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name engine-cyberia-dev:v3.2.70 \
  --image-out-path .
`);
          break;

        case 'cyberia-server':
          shellExec(
            `clear && node bin/cyberia run-workflow build-server-dashboard --output-path ./cyberia-server/public/index.html`,
          );
          shellExec(`
cp -f src/runtime/cyberia-server/Dockerfile.dev cyberia-server/Dockerfile.dev
node bin image --path cyberia-server \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name cyberia-server-dev:v3.2.70 \
  --image-out-path .
`);
          break;
        case 'cyberia-client':
          shellExec(`clear
cp -f src/runtime/cyberia-client/Dockerfile.dev cyberia-client/Dockerfile.dev
node bin image --path cyberia-client \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name cyberia-client-dev:v3.2.70 \
  --image-out-path .
`);
          break;
      }
    });

  {
    // docker compose lyfe cycle commands for the dd-cyberia deployment
    const dockerComposeId = 'cyberia';
    const deployId = 'dd-cyberia';
    const commands = {
      'docker:generate': `node bin docker-compose --generate --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:up': `node bin docker-compose --up --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:up:build': `node bin docker-compose --up --build --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:down': `node bin docker-compose --down --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:down:volumes': `node bin docker-compose --down --volumes --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:restart': `node bin docker-compose --restart --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:pull': `node bin docker-compose --pull --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:logs': `node bin docker-compose --logs --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:status': `node bin docker-compose --status --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
      'docker:reset': `node bin docker-compose --reset --deploy-id ${deployId} --docker-compose-id ${dockerComposeId}`,
    };
    for (const [cmd, action] of Object.entries(commands))
      runner.command(cmd).action(() => {
        shellExec(action);
      });
  }

  runner
    .command('seed-dialogues')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Upsert DefaultCyberiaDialogues into the cyberia-dialogue collection (idempotent)')
    .action(async (options) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('seed-dialogues', { deployId, host, path, db });

      await DataBaseProviderService.load({ apis: ['cyberia-dialogue'], host, path, db });

      const CyberiaDialogue = DataBaseProviderService.getModel('cyberia-dialogue', { host, path });

      // Upsert each dialogue record keyed by (code, order) — idempotent.
      let upserted = 0;
      for (const dlg of DefaultCyberiaDialogues) {
        await CyberiaDialogue.findOneAndUpdate(
          { code: dlg.code, order: dlg.order },
          { $set: { speaker: dlg.speaker, text: dlg.text, mood: dlg.mood } },
          { upsert: true },
        );
        upserted++;
      }

      logger.info(`seed-dialogues: ${upserted} dialogue records upserted`);

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  runner
    .command('seed-actions-quests')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Upsert DefaultCyberiaActions + DefaultCyberiaQuests into Mongo (idempotent)')
    .action(async (options) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('seed-actions-quests', { deployId, host, path, db });

      await DataBaseProviderService.load({ apis: ['cyberia-action', 'cyberia-quest'], host, path, db });

      const CyberiaAction = DataBaseProviderService.getModel('cyberia-action', { host, path });
      const CyberiaQuest = DataBaseProviderService.getModel('cyberia-quest', { host, path });

      let actions = 0;
      for (const a of DefaultCyberiaActions) {
        await CyberiaAction.findOneAndUpdate({ code: a.code }, { $set: a }, { upsert: true });
        actions++;
      }
      let quests = 0;
      for (const q of DefaultCyberiaQuests) {
        await CyberiaQuest.findOneAndUpdate({ code: q.code }, { $set: q }, { upsert: true });
        quests++;
      }

      logger.info(`seed-actions-quests: ${actions} actions, ${quests} quests upserted`);

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  runner
    .command('seed-skills')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Upsert DefaultSkillConfig into the cyberia-skill collection (full records, idempotent)')
    .action(async (options) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('seed-skills', { deployId, host, path, db });

      await DataBaseProviderService.load({ apis: ['cyberia-skill'], host, path, db });

      const CyberiaSkill = DataBaseProviderService.getModel('cyberia-skill', { host, path });

      // Upsert each skill record keyed by triggerItemId — full record (logic
      // event keys + expanded skills metadata), unlike the instance-conf
      // skillConfig schema which keeps only triggerItemId + logicEventIds.
      let upserted = 0;
      for (const sk of DefaultSkillConfig) {
        await CyberiaSkill.findOneAndUpdate(
          { triggerItemId: sk.triggerItemId },
          { $set: { logicEventIds: sk.logicEventIds || [], skills: sk.skills || [] } },
          { upsert: true },
        );
        upserted++;
      }

      logger.info(
        `seed-skills: ${upserted} skill records upserted`,
        DefaultSkillConfig.map((e) => `${e.triggerItemId} → [${(e.logicEventIds || []).join(', ')}]`),
      );

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  runner
    .command('seed-entities')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Upsert ENTITY_TYPE_DEFAULTS into the cyberia-entity-type-default collection (idempotent)')
    .action(async (options) => {
      if (!options.envPath) options.envPath = `./.env`;
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      if (options.dev && process.env.DEFAULT_DEPLOY_ID) {
        const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
        if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
      }

      const deployId = process.env.DEFAULT_DEPLOY_ID;
      const host = process.env.DEFAULT_DEPLOY_HOST;
      const path = process.env.DEFAULT_DEPLOY_PATH;

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error(`Server config not found: ${confServerPath}`);
        process.exit(1);
      }
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('seed-entities', { deployId, host, path, db });

      await DataBaseProviderService.load({ apis: ['cyberia-entity-type-default'], host, path, db });

      const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('cyberia-entity-type-default', { host, path });

      // Reconcile DB indexes with the current schema. This drops the obsolete
      // unique (entityType, liveItemIds) index from earlier builds so the same
      // itemId may appear in multiple same-type defaults (subset matching), and
      // (re)creates the non-unique liveItemIds lookup index.
      try {
        await CyberiaEntityTypeDefault.syncIndexes();
      } catch (error) {
        logger.warn(`seed-entities: syncIndexes skipped: ${error?.message || error}`);
      }

      // Resolution is by subset containment (most-specific match wins), so there
      // is NO per-itemId uniqueness — the same itemId may appear in many entries
      // (across entity types, or within one type at different specificity). Every
      // entry is upserted, idempotently, by its exact (entityType, liveItemIds) key.
      let upserted = 0;
      for (const ed of ENTITY_TYPE_DEFAULTS) {
        await CyberiaEntityTypeDefault.findOneAndUpdate(
          { entityType: ed.entityType, liveItemIds: ed.liveItemIds || [] },
          {
            $set: {
              entityType: ed.entityType,
              liveItemIds: ed.liveItemIds || [],
              deadItemIds: ed.deadItemIds || [],
              dropItemIds: ed.dropItemIds || [],
              defaultObjectLayers: ed.defaultObjectLayers || [],
              behavior: ed.behavior || '',
            },
          },
          { upsert: true },
        );
        upserted++;
      }

      logger.info(
        `seed-entities: ${upserted} entity-type-default records upserted`,
        ENTITY_TYPE_DEFAULTS.map((e) => `${e.entityType} → [${(e.liveItemIds || []).join(', ')}]`),
      );

      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    });

  runner
    .command('generate-semantic-examples')
    .option('--seed <seed>', 'Base seed string (each type gets a unique suffix appended)', 'example')
    .option('--frame-count <frameCount>', 'Number of frames to generate per item (default: 4)', parseInt)
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--dev', 'Force development environment')
    .description('Generate one procedural example of every registered semantic prefix')
    .action(async (options) => {
      const SEMANTIC_TYPES = [
        // 'floor-desert',
        // 'floor-grass',
        // 'floor-water',
        // 'floor-stone',
        // 'floor-lava',
        'skin-random',
        'skin-dark',
        'skin-light',
        'skin-vivid',
        'skin-natural',
        'skin-shaved',
        // 'resource-desert-petal',
        // 'resource-desert-stone',
        // 'resource-desert-polygon',
        // 'resource-desert-thread',
        // 'resource-grass-petal',
        // 'resource-grass-stone',
        // 'resource-grass-polygon',
        // 'resource-grass-thread',
        // 'resource-water-petal',
        // 'resource-water-stone',
        // 'resource-water-polygon',
        // 'resource-water-thread',
        // 'resource-stone-petal',
        // 'resource-stone-stone',
        // 'resource-stone-polygon',
        // 'resource-stone-thread',
        // 'resource-lava-petal',
        // 'resource-lava-stone',
        // 'resource-lava-polygon',
        // 'resource-lava-thread',
      ];

      const baseSeed = options.seed || 'example';
      const frameCount = options.frameCount || 2;
      const envFlag = options.envPath ? ` --env-path ${options.envPath}` : '';
      const devFlag = options.dev ? ' --dev' : '';

      logger.info(
        `Generating ${SEMANTIC_TYPES.length} semantic examples (seed base: "${baseSeed}", frames: ${frameCount})`,
      );

      for (const prefix of SEMANTIC_TYPES) {
        const seed = `${baseSeed}-${prefix}`;
        const cmd = `node bin/cyberia ol ${prefix} --generate --seed ${seed} --frame-count ${frameCount}${envFlag}${devFlag}`;
        logger.info(`  → ${cmd}`);
        shellExec(cmd);
      }

      logger.info('All semantic examples generated.');
    });

  runner
    .command('build-manifest')
    .option(
      '--dev',
      'Build dev-variant manifests (kind cluster, Dockerfile.dev). Default builds prod (kubeadm, Dockerfile).',
    )
    .option(
      '--node-name <node-name>',
      'Target kubeadm/k3s node for hostPath PV nodeAffinity (production). ' +
        'Overrides the UNDERPOST_DEPLOY_NODE env and os.hostname() fallback — set it when building outside the target node (CI/container) so nodeSelector is not the build box hostname.',
    )
    .description(
      'Build k8s resource manifests for the Cyberia mmo-server + mmo-client instances. ' +
        'Each expands into one deployment per variant declared in the conf.instances.json multiInstance block. ' +
        'Without --dev: production manifests (Dockerfile, kubeadm). With --dev: dev manifests (Dockerfile.dev, kind).',
    )
    .action((options) => {
      const isDev = !!options.dev;
      const nodeFlag = options.nodeName ? ` --node-name ${options.nodeName}` : '';

      // ── Dynamically resolve instance codes from conf.instances.json ──────
      // Read all cyberia-server runtime instances and collect their
      // multiInstance variant codes. These are used to update the
      // INSTANCE_CODES label in Dockerfile.dev so the dev image
      // provisions every variant's backup dir and saga at build time.
      //
      // Only codes that have an on-disk instance backup directory are
      // included. The saga file is optional — the Dockerfile's for loop
      // already handles missing sagas gracefully (`if [ -f ... ]`).
      // A variant declared in conf.instances.json without the instance
      // directory is silently skipped so the Dockerfile never tries to
      // copy a non-existent directory and the container build does not fail.
      const confInstancesPath = './engine-private/conf/dd-cyberia/conf.instances.json';
      const cyberiaInstancesDir = '/home/dd/cyberia-instances';
      let instanceCodes = 'amethyst-strata-expansion,FOREST'; // fallback
      try {
        const confInstances = JSON.parse(fs.readFileSync(confInstancesPath, 'utf8'));
        const serverInstances = confInstances.filter((inst) => inst.runtime === 'cyberia-server');
        const codes = new Set();
        for (const inst of serverInstances) {
          if (inst.multiInstance?.variants) {
            for (const v of inst.multiInstance.variants) {
              if (!v.code) continue;
              // Skip codes that have no on-disk instance backup dir
              const instanceDir = `${cyberiaInstancesDir}/instances/${v.code}`;
              if (!fs.existsSync(instanceDir)) {
                logger.info(`[build-manifest] Skipping code "${v.code}": no instance dir at ${instanceDir}`);
                continue;
              }
              codes.add(v.code);
            }
          }
        }
        if (codes.size > 0) {
          instanceCodes = [...codes].join(',');
          logger.info(`[build-manifest] Resolved instance codes: ${instanceCodes}`);
        } else {
          logger.warn(`[build-manifest] No valid instance codes found; keeping fallback: ${instanceCodes}`);
        }
      } catch (err) {
        logger.warn(`[build-manifest] Could not read ${confInstancesPath}: ${err.message}; using fallback`);
      }

      // ── Update Dockerfile.dev + Dockerfile INSTANCE_CODES build arg ──────
      // The value lives in a clean `ARG INSTANCE_CODES="…"` default (not a
      // marker-wrapped shell string — a `/** … */` literal would glob-expand in
      // the RUN's `for` loop). Rewrite the ARG default with the resolved codes so
      // every image — dev and production — provisions every variant's backup dir
      // and saga at build time. Overridable at build via `--build-arg`.
      for (const dockerfileName of ['Dockerfile.dev', 'Dockerfile']) {
        const dockerfilePath = `./src/runtime/engine-cyberia/${dockerfileName}`;
        try {
          const content = fs.readFileSync(dockerfilePath, 'utf8');
          const updated = content.replace(/ARG INSTANCE_CODES="[^"]*"/, `ARG INSTANCE_CODES="${instanceCodes}"`);
          if (updated === content && !/ARG INSTANCE_CODES="/.test(content)) {
            logger.warn(`[build-manifest] No 'ARG INSTANCE_CODES' anchor in ${dockerfilePath}; skipped`);
          } else if (updated !== content) {
            fs.writeFileSync(dockerfilePath, updated);
            logger.info(`[build-manifest] Updated INSTANCE_CODES in ${dockerfilePath} -> ${instanceCodes}`);
          }
        } catch (err) {
          logger.warn(`[build-manifest] Could not update ${dockerfilePath}: ${err.message}`);
        }
      }

      // ── Update catalog-cyberia.js privateConfPaths ───────────────────────
      // The array block in privateConfPaths is bounded by /** INSTANCE_CODES */
      // markers (valid JS comments here). Replace everything between them with
      // the resolved per-code paths. These are synced by syncPrivateConf, which
      // copies each entry from `./engine-private/<path>` — so they must match the
      // LOCAL engine-private layout (`cyberia-instances/<code>`,
      // `cyberia-sagas/<code>.json`), not the published cyberia-instances repo
      // (which uses `instances/` + `sagas/`). Only emit paths that exist on disk
      // so the sync never hits ENOENT on a variant without local content.
      const catalogPath = './src/projects/cyberia/catalog-cyberia.js';
      try {
        const catalogContent = fs.readFileSync(catalogPath, 'utf8');
        const codes = instanceCodes
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        const lines = [];
        for (const code of codes) {
          if (fs.existsSync(`./engine-private/cyberia-instances/${code}`))
            lines.push(`    'cyberia-instances/${code}',`);
          if (fs.existsSync(`./engine-private/cyberia-sagas/${code}.json`))
            lines.push(`    'cyberia-sagas/${code}.json',`);
        }
        const replacement = lines.join('\n');
        const catalogUpdated = catalogContent.replace(
          /\/\*\* INSTANCE_CODES \*\/[\s\S]*?\/\*\* INSTANCE_CODES \*\//,
          `/** INSTANCE_CODES */\n\n${replacement}\n\n    /** INSTANCE_CODES */`,
        );
        if (catalogUpdated !== catalogContent) {
          fs.writeFileSync(catalogPath, catalogUpdated);
          logger.info(`[build-manifest] Updated privateConfPaths in ${catalogPath}`);
        }
      } catch (err) {
        logger.warn(`[build-manifest] Could not update ${catalogPath}: ${err.message}`);
      }

      // ── Build dev manifests (always --kind --dev) ────────────────────────
      {
        const flags = `--kind --dev${nodeFlag}`;
        shellExec(`node bin run instance-build-manifest 'dd-cyberia,mmo-client,./cyberia-client' ${flags}`);
        shellExec(`node bin run instance-build-manifest 'dd-cyberia,mmo-server,./cyberia-server' ${flags}`);
      }
      // ── Build prod manifests (--kubeadm, no --dev) ───────────────────────
      if (!isDev) {
        const flags = `--kubeadm${nodeFlag}`;
        shellExec(`node bin run instance-build-manifest 'dd-cyberia,mmo-client,./cyberia-client' ${flags}`);
        shellExec(`node bin run instance-build-manifest 'dd-cyberia,mmo-server,./cyberia-server' ${flags}`);
      }
      // Copy canonical doc sources into the generated project READMEs.
      // Edit the canonical sources; never hand-edit these generated outputs.
      fs.copyFileSync('./src/client/public/cyberia-docs/CYBERIA-CLIENT.md', './cyberia-client/README.md');
      fs.copyFileSync('./src/client/public/cyberia-docs/CYBERIA-SERVER.md', './cyberia-server/README.md');
      fs.copyFileSync(
        './.github/workflows/cyberia-client.cd.yml',
        './cyberia-client/.github/workflows/cyberia-client.cd.yml',
      );
      fs.copyFileSync(
        './.github/workflows/cyberia-server.cd.yml',
        './cyberia-server/.github/workflows/cyberia-server.cd.yml',
      );
      shellExec('cp -a ./engine-private/conf/dd-cyberia/docker-compose/cyberia/. ./src/runtime/engine-cyberia/');
      shellExec('node bin/cyberia.js instance --publish-build');
      logger.info(`run-workflow build-manifest complete (${isDev ? 'dev' : 'prod'})`);
    });

  runner
    .command('publish')
    .option('--dry-run', 'Dry run: show commands without executing them')
    .action((options) => {
      if (options.dryRun) {
        shellExec('node bin cmt --log --unpush cyberia-server');
        shellExec('node bin cmt --log --unpush cyberia-client');
        shellExec('node bin cmt --log --unpush');
        shellExec('node bin cmt --log --unpush ../cyberia-instances');
      } else {
        shellExec('node bin/cyberia.js instance --publish', {
          silentOnError: true,
        });
        shellExec('node bin push cyberia-server underpostnet/cyberia-server', {
          silentOnError: true,
        });
        shellExec('node bin push cyberia-client underpostnet/cyberia-client', {
          silentOnError: true,
        });
        shellExec('node bin run template-deploy', {
          silentOnError: true,
        });
      }
    });

  runner
    .command('build-server-dashboard')
    .option(
      '--dev',
      'Build a development variant of the dashboard with dev-specific env vars (e.g. localhost API endpoints).',
    )
    .option(
      '--output-path <path>',
      'Override output path for the rendered HTML (default: ./cyberia-server/public/index.html). ' +
        'Used by CI when this command is invoked from inside an engine checkout that lives ' +
        'alongside (not inside) the cyberia-server repo — pass e.g. ../public/index.html.',
    )
    .description('Build a static HTML dashboard for cyberia-server metrics and operational status. ')
    .action((options) => {
      const outputPath = options.outputPath || './cyberia-server/public/index.html';
      shellExec(
        `node bin static --page ./src/client/ssr/views/CyberiaServerMetrics.js` +
          ` --output-path ${outputPath}` +
          ` --title 'Cyberia Server Metrics'` +
          ` --favicon /favicon.ico` +
          ` --description 'Operational dashboard for the cyberia-server MMO runtime.'` +
          ` --lang en` +
          ` --env ${options.dev ? 'development' : 'production'}`,
      );
    });

  // Passthrough check: if the user invoked a command that is OWNED by the
  // underpost CLI (not the cyberia overlay), throw the sentinel error so
  // the catch block below can re-run argv through underpost. The match is
  // strict on process.argv[2] (the first positional after `node bin/cyberia`)
  // so we only passthrough when the top-level command name actually
  // belongs to underpost.
  if (
    process.argv[2] &&
    underpostProgram.commands.find((c) => c._name === process.argv[2]) &&
    !program.commands.find((c) => c._name === process.argv[2])
  ) {
    throw new Error('Trigger underpost passthrough');
  }

  await program.parseAsync();
} catch (error) {
  // ONLY reroute on the explicit passthrough sentinel. Any other thrown
  // error (subprocess non-zero from shellExec's fail-fast default, CLI
  // parse errors, missing modules) must propagate as a non-zero process
  // exit so GitHub Actions / CI parents observe the failure. Without this
  // guard, a genuine build failure was being silently rerouted into the
  // underpost CLI and then masked behind a misleading "unknown command"
  // line.
  if (error && error.message === 'Trigger underpost passthrough') {
    process.argv = process.argv.filter((c) => c !== 'underpost');
    logger.warn('Rerouting to underpost cli...');
    try {
      await underpostProgram.parseAsync();
    } catch (err) {
      logger.error(err);
      process.exit(1);
    }
  } else {
    logger.error(error);
    process.exit(1);
  }
}
