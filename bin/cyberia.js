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
import stringify from 'fast-json-stable-stringify';
import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { generateBesuManifests, deployBesu, removeBesu } from '../src/server/besu-genesis-generator.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { loadConfServerJson } from '../src/server/conf.js';
import {
  ObjectLayerEngine,
  resolveCanonicalCid,
  pngDirectoryIteratorByObjectLayerType,
  getKeyFramesDirectionsFromNumberFolderDirection,
  buildImgFromTile,
} from '../src/server/object-layer.js';
import { AtlasSpriteSheetGenerator } from '../src/server/atlas-sprite-sheet-generator.js';
import { generateMultiFrame, lookupSemantic, semanticRegistry } from '../src/server/semantic-layer-generator.js';
import { IpfsClient } from '../src/server/ipfs-client.js';
import { createPinRecord } from '../src/api/ipfs/ipfs.service.js';
import { program as underpostProgram } from '../src/cli/index.js';
import crypto from 'crypto';
import nodePath from 'path';
import Underpost from '../src/index.js';
import { newInstance } from '../src/client/components/core/CommonJs.js';
import {
  ITEM_TYPES as itemTypes,
  DefaultCyberiaItems,
  DefaultSkillConfig,
  DefaultCyberiaDialogues,
} from '../src/client/components/cyberia-portal/CommonCyberiaPortal.js';

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

  await DataBaseProvider.load({
    apis: ['object-layer'],
    host,
    path,
    db,
  });

  const ObjectLayer = DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayer;
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
        /** @type {import('mongoose').Model} */
        const Ipfs = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Ipfs;

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
           * @type {Object<string, import('../src/server/object-layer.js').ObjectLayerData>}
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

        await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
      },
    )
    .description('Object layer management');

  // ── instance: Cyberia instance backup / restore ─────────────────────────
  program
    .command('instance [instance-code]')
    .option('--export [path]', 'Export instance and related documents to a backup directory')
    .option('--import [path]', 'Import instance and related documents from a backup directory (preserveUUID, upsert)')
    .option('--drop', 'Drop existing instance, maps and object layers before importing')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Export/import a Cyberia instance with all related maps, entities and object layers')
    .action(async (instanceCode, options = {}) => {
      if (!instanceCode) {
        logger.error('instance-code argument is required');
        process.exit(1);
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
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const { db } = confServer[host][path];

      db.host = options.mongoHost
        ? options.mongoHost
        : options.dev
          ? db.host
          : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

      logger.info('instance env', { env: options.envPath, deployId, host, path, db });

      await DataBaseProvider.load({
        apis: [
          'cyberia-instance',
          'cyberia-instance-conf',
          'cyberia-map',
          'cyberia-entity',
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

      const dbModels = DataBaseProvider.instance[`${host}${path}`].mongoose.models;
      const CyberiaInstance = dbModels.CyberiaInstance;
      const CyberiaInstanceConf = dbModels.CyberiaInstanceConf;
      const CyberiaMap = dbModels.CyberiaMap;
      const ObjectLayer = dbModels.ObjectLayer;
      const ObjectLayerRenderFrames = dbModels.ObjectLayerRenderFrames;
      const AtlasSpriteSheet = dbModels.AtlasSpriteSheet;
      const File = dbModels.File;
      const Ipfs = dbModels.Ipfs;

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

      const collectMfsPaths = (doc = {}) => {
        const paths = new Set();
        if (doc.mfsPath) paths.add(doc.mfsPath);
        for (const p of doc.mfsPaths || []) {
          if (p) paths.add(p);
        }
        return [...paths];
      };

      const upsertCanonicalPinEntry = (pinMap, { cid, resourceType, mfsPath = '' }) => {
        if (!cid || !resourceType) return;
        const key = `${resourceType}:${cid}`;
        const nextPath = mfsPath || '';
        if (!pinMap.has(key)) {
          pinMap.set(key, {
            cid,
            resourceType,
            mfsPath: nextPath,
            mfsPaths: nextPath ? [nextPath] : [],
          });
          return;
        }

        const existing = pinMap.get(key);
        if (nextPath && !existing.mfsPaths.includes(nextPath)) {
          existing.mfsPaths.push(nextPath);
        }
        if (!existing.mfsPath && nextPath) {
          existing.mfsPath = nextPath;
        }
      };

      const serialiseCanonicalPins = (pinMap) =>
        [...pinMap.values()].map((entry) => ({
          cid: entry.cid,
          resourceType: entry.resourceType,
          ...(entry.mfsPath ? { mfsPath: entry.mfsPath } : {}),
          ...(entry.mfsPaths.length ? { mfsPaths: entry.mfsPaths } : {}),
        }));

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
          await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
          process.exit(1);
        }

        const backupDir =
          typeof options.export === 'string' && options.export
            ? options.export
            : `./engine-private/cyberia-instances/${instanceCode}`;

        fs.ensureDirSync(backupDir);
        logger.info('Exporting instance', { code: instanceCode, backupDir });

        fs.ensureDirSync(`${backupDir}/files`);

        // Helper: export a File document to the files/ directory
        const exportFileDoc = async (fileId, fileKey) => {
          if (!fileId) return;
          const file = await File.findById(fileId).lean();
          if (!file) return;
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
        if (instance.thumbnail) {
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
          fs.writeJsonSync(`${backupDir}/cyberia-instance-conf.json`, instanceConf, { spaces: 2 });
          logger.info('Exported CyberiaInstanceConf', { instanceCode });
        } else {
          logger.warn('Could not create or find CyberiaInstanceConf', { instanceCode });
        }

        // 2. Collect all map codes (instance maps + portal targets)
        const mapCodes = new Set(instance.cyberiaMapCodes || []);
        for (const portal of instance.portals || []) {
          if (portal.sourceMapCode) mapCodes.add(portal.sourceMapCode);
          if (portal.targetMapCode) mapCodes.add(portal.targetMapCode);
        }

        // 3. Export maps + thumbnails
        const maps = await CyberiaMap.find({ code: { $in: [...mapCodes] } }).lean();
        fs.ensureDirSync(`${backupDir}/maps`);
        for (const map of maps) {
          fs.writeJsonSync(`${backupDir}/maps/${map.code}.json`, map, { spaces: 2 });
          if (map.thumbnail) {
            await exportFileDoc(map.thumbnail, `thumb-map-${map.code}`);
          }
        }
        logger.info(`Exported ${maps.length} CyberiaMap document(s)`, { codes: maps.map((m) => m.code) });

        // 4. Collect all objectLayerItemIds from map entities
        const objectLayerItemIds = new Set();
        for (const map of maps) {
          for (const entity of map.entities || []) {
            for (const itemId of entity.objectLayerItemIds || []) {
              objectLayerItemIds.add(itemId);
            }
          }
        }

        // 4b. Add instance-level itemIds
        for (const id of instance.itemIds || []) {
          if (id) objectLayerItemIds.add(id);
        }

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
          const ipfsPayloadFailures = [];
          let ipfsPayloadExportCount = 0;

          const exportCanonicalPayload = async ({ payloadBuffer, resourceType, mfsPath, filename, itemKey }) => {
            const hashResult = await IpfsClient.hashBufferForIpfs(payloadBuffer, filename);
            if (!hashResult?.cid) {
              ipfsPayloadFailures.push({ itemKey, resourceType, mfsPath, reason: 'Failed to hash payload via Kubo' });
              return null;
            }

            const payloadPath = `${backupDir}/ipfs/content/${hashResult.cid}.bin`;
            if (!fs.existsSync(payloadPath)) {
              fs.writeFileSync(payloadPath, payloadBuffer);
              ipfsPayloadExportCount++;
            }

            upsertCanonicalPinEntry(canonicalPins, {
              cid: hashResult.cid,
              resourceType,
              mfsPath,
            });
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

            // Export AtlasSpriteSheet + its File using canonical payload bytes from the DB state.
            if (ol.atlasSpriteSheetId) {
              const atlas = await AtlasSpriteSheet.findById(ol.atlasSpriteSheetId).lean();
              if (!atlas) {
                ipfsPayloadFailures.push({
                  itemKey,
                  resourceType: 'atlas-sprite-sheet',
                  mfsPath: itemPaths.atlasSpriteSheet,
                  reason: 'AtlasSpriteSheet document not found in MongoDB',
                });
                continue;
              }

              const atlasExport = newInstance(atlas);
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

              const atlasMetadataBuffer = Buffer.from(stringify(atlasExport.metadata || {}), 'utf-8');
              const atlasMetadataCid = await exportCanonicalPayload({
                payloadBuffer: atlasMetadataBuffer,
                resourceType: 'atlas-metadata',
                mfsPath: itemPaths.atlasMetadata,
                filename: `${itemKey}_atlas_sprite_sheet_metadata.json`,
                itemKey,
              });
              if (!atlasMetadataCid) continue;

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

            objectLayerExport.cid = objectLayerCid;
            fs.writeJsonSync(`${backupDir}/object-layers/${itemKey}.json`, objectLayerExport, { spaces: 2 });
          }

          if (ipfsPayloadFailures.length > 0) {
            for (const failure of ipfsPayloadFailures) {
              logger.error('Canonical IPFS payload export failed', failure);
            }
            await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
            process.exit(1);
          }

          const sanitised = serialiseCanonicalPins(canonicalPins);
          fs.writeJsonSync(`${backupDir}/ipfs/pins.json`, sanitised, { spaces: 2 });
          logger.info(
            `Exported ${sanitised.length} canonical Ipfs pin record(s) and ${ipfsPayloadExportCount} raw payload file(s)`,
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
          await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
          process.exit(1);
        }

        logger.info('Importing instance', { code: instanceCode, backupDir });

        // 0. Drop existing documents if --drop is set
        if (options.drop) {
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

            // Query other instances/maps for shared thumbnail exclusion
            const otherInstances = await CyberiaInstance.find({ code: { $ne: instanceCode } }, { thumbnail: 1 }).lean();

            if (dropMapCodes.size > 0) {
              const dropMaps = await CyberiaMap.find({ code: { $in: [...dropMapCodes] } }).lean();
              const dropOlItemIds = new Set();
              for (const map of dropMaps) {
                if (map.thumbnail) thumbFileIds.push(map.thumbnail);
                for (const entity of map.entities || []) {
                  for (const itemId of entity.objectLayerItemIds || []) {
                    dropOlItemIds.add(itemId);
                  }
                }
              }

              // Add instance-level itemIds (may not appear in any map entity)
              for (const id of existingInstance.itemIds || []) if (id) dropOlItemIds.add(id);

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

              // Exclude OL item IDs referenced by maps outside this instance
              const otherMaps = await CyberiaMap.find(
                { code: { $nin: [...dropMapCodes] } },
                { 'entities.objectLayerItemIds': 1, thumbnail: 1 },
              ).lean();
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

              // Exclude thumbnail File IDs referenced by other instances or maps
              const otherMapThumbs = otherMaps.map((m) => m.thumbnail?.toString()).filter(Boolean);
              const otherInstThumbs = otherInstances.map((i) => i.thumbnail?.toString()).filter(Boolean);
              const sharedThumbIds = new Set([...otherMapThumbs, ...otherInstThumbs]);
              for (let i = thumbFileIds.length - 1; i >= 0; i--) {
                if (sharedThumbIds.has(thumbFileIds[i].toString())) thumbFileIds.splice(i, 1);
              }

              if (dropOlItemIds.size > 0) {
                // Gather ObjectLayers to collect related doc IDs and CIDs
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
                  const atlasDocs = await AtlasSpriteSheet.find(
                    { _id: { $in: atlasIds } },
                    { fileId: 1, cid: 1 },
                  ).lean();
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

              const mapResult = await CyberiaMap.deleteMany({ code: { $in: [...dropMapCodes] } });
              logger.info(`Dropped ${mapResult.deletedCount} CyberiaMap document(s)`);
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
          const confData = fs.readJsonSync(confImportPath);
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
          await CyberiaInstance.deleteOne({ code: instanceCode });
          await CyberiaInstance.deleteOne({ _id: instanceData._id });
          await CyberiaInstance.create(instanceData);
          logger.info('Imported CyberiaInstance', { code: instanceCode });
        } else {
          logger.warn(`Instance file not found: ${instancePath}`);
        }

        // 8. Restore IPFS pin records and payloads
        const ipfsFile = `${backupDir}/ipfs/pins.json`;
        if (fs.existsSync(ipfsFile)) {
          const ipfsDocs = fs.readJsonSync(ipfsFile);
          const ipfsContentDir = `${backupDir}/ipfs/content`;
          let ipfsCount = 0;
          let ipfsSkipped = 0;

          // Infer resourceType from mfsPath for legacy records that pre-date the required field.
          // MFS path conventions (from atlas-sprite-sheet.service.js and object-layer.service.js):
          //   /object-layer/<id>/<id>_atlas_sprite_sheet.png       → 'atlas-sprite-sheet'
          //   /object-layer/<id>/<id>_atlas_sprite_sheet_metadata.json → 'atlas-metadata'
          //   /object-layer/<id>/<id>_data.json                    → 'object-layer-data'
          const inferResourceType = (doc) => {
            if (doc.resourceType) return doc.resourceType;
            const p = doc.mfsPath || '';
            if (p.endsWith('_atlas_sprite_sheet.png')) return 'atlas-sprite-sheet';
            if (p.endsWith('_atlas_sprite_sheet_metadata.json')) return 'atlas-metadata';
            if (p.endsWith('_data.json')) return 'object-layer-data';
            return null;
          };
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
          const backupCids = [...new Set(backupPinEntries.map((entry) => entry.cid).filter(Boolean))];
          if (backupCids.length > 0) {
            await Ipfs.deleteMany({ cid: { $in: backupCids } });
          }

          const restoreAdditionalMfsPaths = async (cid, mfsPaths, primaryPath) => {
            let restoredCount = 0;
            for (const mfsPath of mfsPaths) {
              if (!mfsPath || mfsPath === primaryPath) continue;
              const ok = await IpfsClient.restoreMfsPath(cid, mfsPath);
              if (ok) restoredCount++;
            }
            return restoredCount;
          };

          const upsertImportedPin = async ({ cid, resourceType, mfsPath }) => {
            if (!cid || !resourceType) return;
            await Ipfs.deleteMany({ cid, resourceType });
            await createPinRecord({ cid, resourceType, mfsPath: mfsPath || '', options: { host, path } });
          };

          if (fs.existsSync(ipfsContentDir)) {
            let cidRewriteCount = 0;
            let extraMfsRestoreCount = 0;

            for (const [index, doc] of backupPinEntries.entries()) {
              const mfsPaths = collectMfsPaths(doc);
              const primaryPath = mfsPaths[0] || '';
              const payloadPath = `${ipfsContentDir}/${doc.cid}.bin`;

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

              extraMfsRestoreCount += await restoreAdditionalMfsPaths(finalCid, mfsPaths, primaryPath);
              await upsertImportedPin({ cid: finalCid, resourceType: doc.resourceType, mfsPath: primaryPath });
              ipfsCount++;
            }

            logger.info(
              `Imported ${ipfsCount} Ipfs pin record(s) from exact backup payloads${ipfsSkipped ? `, skipped ${ipfsSkipped}` : ''}`,
            );
            logger.info(
              `IPFS raw payload restore: ${ipfsCount}/${backupPinEntries.length} record(s) restored, ${extraMfsRestoreCount} additional MFS path(s) restored${cidRewriteCount ? `, ${cidRewriteCount} CID rewrite(s)` : ''}`,
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

          // Query other instances for shared thumbnail exclusion
          const otherInstances = await CyberiaInstance.find({ code: { $ne: instanceCode } }, { thumbnail: 1 }).lean();

          if (dropMapCodes.size > 0) {
            const dropMaps = await CyberiaMap.find({ code: { $in: [...dropMapCodes] } }).lean();
            const dropOlItemIds = new Set();
            for (const map of dropMaps) {
              if (map.thumbnail) thumbFileIds.push(map.thumbnail);
              for (const entity of map.entities || []) {
                for (const itemId of entity.objectLayerItemIds || []) {
                  dropOlItemIds.add(itemId);
                }
              }
            }

            // Add instance-level itemIds (may not appear in any map entity)
            for (const id of existingInstance.itemIds || []) if (id) dropOlItemIds.add(id);

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

            // Exclude OL item IDs referenced by maps outside this instance
            const otherMaps = await CyberiaMap.find(
              { code: { $nin: [...dropMapCodes] } },
              { 'entities.objectLayerItemIds': 1, thumbnail: 1 },
            ).lean();
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

            // Exclude thumbnail File IDs referenced by other instances or maps
            const otherMapThumbs = otherMaps.map((m) => m.thumbnail?.toString()).filter(Boolean);
            const otherInstThumbs = otherInstances.map((i) => i.thumbnail?.toString()).filter(Boolean);
            const sharedThumbIds = new Set([...otherMapThumbs, ...otherInstThumbs]);
            for (let i = thumbFileIds.length - 1; i >= 0; i--) {
              if (sharedThumbIds.has(thumbFileIds[i].toString())) thumbFileIds.splice(i, 1);
            }

            if (dropOlItemIds.size > 0) {
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

            const mapResult = await CyberiaMap.deleteMany({ code: { $in: [...dropMapCodes] } });
            logger.info(`Dropped ${mapResult.deletedCount} CyberiaMap document(s)`);
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

      await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
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
          await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
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
          await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
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
    .description('Import default Object Layer items, skill config, and dialogues into MongoDB')
    .action(async (options) => {
      const devFlag = options.dev ? ' --dev' : '';
      shellExec(`node bin/cyberia ol ${DefaultCyberiaItems.map((e) => e.item.id)} --import${devFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-skill-config${devFlag}`);
      shellExec(`node bin/cyberia run-workflow seed-dialogues${devFlag}`);
    });

  runner
    .command('seed-skill-config')
    .option('--instance-code <code>', 'CyberiaInstance code to update (default: $INSTANCE_CODE env or "default")')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Upsert default skillConfig entries into a CyberiaInstance document')
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
      const instanceCode = options.instanceCode || process.env.INSTANCE_CODE || 'default';

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

      logger.info('seed-skill-config', { instanceCode, deployId, host, path, db });

      await DataBaseProvider.load({ apis: ['cyberia-instance', 'cyberia-instance-conf'], host, path, db });

      const CyberiaInstance = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaInstance;
      const CyberiaInstanceConf = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaInstanceConf;

      const instance = await CyberiaInstance.findOne({ code: instanceCode }).lean();

      if (!instance) {
        logger.info(
          `CyberiaInstance "${instanceCode}" not found — seeding skillConfig into conf using fallback defaults. ` +
            `To link to a live instance, create or import it with: node bin/cyberia instance ${instanceCode} --import`,
        );
      }

      // Always upsert the conf with DefaultSkillConfig — idempotent regardless of instance existence.
      const conf = await CyberiaInstanceConf.findOneAndUpdate(
        { instanceCode },
        { $set: { skillConfig: DefaultSkillConfig } },
        { upsert: true, returnDocument: 'after' },
      );

      // If a live instance exists, ensure its conf ref is linked.
      if (instance && (!instance.conf || String(instance.conf) !== String(conf._id))) {
        await CyberiaInstance.findByIdAndUpdate(instance._id, { conf: conf._id });
      }

      logger.info(
        `skillConfig seeded for instance "${instanceCode}" (${DefaultSkillConfig.length} entries)`,
        DefaultSkillConfig.map((e) => `${e.triggerItemId} → [${e.logicEventIds.join(', ')}]`),
      );

      await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
    });

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

      await DataBaseProvider.load({ apis: ['cyberia-dialogue'], host, path, db });

      const CyberiaDialogue = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaDialogue;

      // Upsert each dialogue record keyed by (itemId, order) — idempotent.
      let upserted = 0;
      for (const dlg of DefaultCyberiaDialogues) {
        await CyberiaDialogue.findOneAndUpdate(
          { itemId: dlg.itemId, order: dlg.order },
          { $set: { speaker: dlg.speaker, text: dlg.text, mood: dlg.mood } },
          { upsert: true },
        );
        upserted++;
      }

      logger.info(`seed-dialogues: ${upserted} dialogue records upserted`);

      await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
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

  if (underpostProgram.commands.find((c) => c._name == process.argv[2]))
    throw new Error('Trigger underpost passthrough');

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
