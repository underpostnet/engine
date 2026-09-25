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
import { registerStatCommands } from '../src/projects/cyberia/stat-commands.js';
import { Command, InvalidArgumentError } from 'commander';
import fs from 'fs-extra';
import { shellExec } from '../src/server/runtime/process.js';
import { cli } from '../src/server/build/execution.js';
import { loggerFactory } from '../src/server/ops/logger.js';
import { generateBesuManifests, deployBesu, removeBesu } from '../src/projects/cyberia/besu-genesis-generator.js';
import { DataBaseProviderService } from '../src/db/DataBaseProvider.js';
import { CyberiaAudioService } from '../src/api/cyberia-audio/cyberia-audio.service.js';
import { CyberiaEntityTypeDefaultService } from '../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaInstanceConfService } from '../src/api/cyberia-instance-conf/cyberia-instance-conf.service.js';
import {
  collectInstanceItemIds,
  collectSummonedItemIds,
  selectInstanceSkills,
} from '../src/api/cyberia-instance/cyberia-instance-items.js';
import { prepareFallbackAudio, seedFallbackAudio, seedInstanceAudio } from '../src/projects/cyberia/seed-audio.js';
import {
  CyberiaMapAudioConfService,
  parseEventAudioBinding,
} from '../src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';
import {
  deployEnvFilePath,
  etcHostFactory,
  instanceProjectPathFactory,
  loadConfServerJson,
  normalizeInstanceTopology,
} from '../src/server/runtime/conf.js';
import {
  ObjectLayerEngine,
  resolveItemIdentity,
  pngDirectoryIteratorByObjectLayerType,
  buildImgFromTile,
} from '../src/projects/cyberia/object-layer.js';
import {
  ITEM_DEFINITION_APIS,
  boundItemIds,
  catalogModels,
  reconcileItemCatalog,
  findBoundDefinition,
  findBoundDefinitions,
  seedItemCatalog,
} from '../src/projects/cyberia/object-layer-catalog.js';
import { pinContentReferences } from '../src/api/cyberia-item-catalog/item-ref.js';
import { objectLayerTokenId, ownershipRecord } from '../src/api/item-ledger/item-ledger.model.js';
import { sha256HexFromCid } from '../src/api/object-layer/object-layer.identity.js';
import { ItemLedgerIndexer } from '../src/api/item-ledger/item-ledger.indexer.js';
import { CyberiaObjectLayerProfile } from '../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { fetchInstanceObjectLayerItemIds, getInstanceModels } from '../src/projects/cyberia/instance-data.js';
import {
  atlasFileIdsOf,
  exportObjectLayerBackup,
  fileBackup,
  fileFromBackup,
  restoreObjectLayerBackup,
} from '../src/projects/cyberia/instance-backup.js';
import { getKeyframeDirectionsByCode } from '../src/client/components/object-layer/ObjectLayerProtocol.js';
import { DEFAULT_ATLAS_UPSCALE_FACTOR } from '../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { AtlasSpriteSheetStore } from '../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { fileRefFields } from '../src/api/file/file.ref.js';
import {
  CONTENT_PARTITION,
  activateContentRelease,
  assertReleaseId,
  contentReleaseRowFactory,
  materializeWorkspace,
  promoteContentRelease,
  publishContentRelease,
  pruneContentReleases,
  releaseDbConf,
  retireContentRelease,
  rollbackContentRelease,
  validateContentRelease,
} from '../src/projects/cyberia/content-release.js';
import { API_BASE_PATH } from '../src/server/domain/api-contract.js';
import { dropConsumerCanonicalPins, isObjectLayerAuthority } from '../src/api/object-layer/object-layer.publication.js';
import { purgeObjectLayers } from '../src/api/object-layer/object-layer.purge.js';
import * as cyberiaStudio from '../src/projects/cyberia/object-layer.extension.js';
import { consumedApisOf, ownsApi } from '../src/server/domain/consumed-api.js';
import { validateDomainConf } from '../src/projects/cyberia/domain-ownership.js';
import {
  generateMultiFrame,
  lookupSemantic,
  semanticRegistry,
} from '../src/projects/cyberia/semantic-layer-generator.js';
import { createValkeyConnection } from '../src/db/valkey/Valkey.js';
import { CacheService } from '../src/server/storage/cache.js';
import { program as underpostProgram } from '../src/cli/index.js';
import { generateSaga, importSaga } from '../src/projects/cyberia/generate-saga.js';
import crypto from 'crypto';
import os from 'os';
import nodePath from 'path';
import Underpost from '../src/index.js';
import {
  DefaultSkillConfig,
  DefaultCyberiaDialogues,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  ENTITY_TYPE_DEFAULTS,
} from '../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import cyberiaCatalog from '../src/projects/cyberia/catalog-cyberia.js';

import {
  DEFAULT_INSTANCE_CODE,
  ITEM_TYPES as itemTypes,
  DefaultCyberiaItems,
} from '../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { balanceStats, resolveStatBounds, statPolicyActive } from '../src/projects/cyberia/stat-balance.js';
import { loadDeployCatalog } from '../src/server/build/catalog.js';
import {
  DEPLOY_MANIFEST_INDENT,
  STAGED_CLI_PACKAGE,
  buildDeployPackageJson,
  deployPackagePathFactory,
  stageCliPackage,
} from '../src/server/build/package.js';

/**
 * The resolved server conf of the deploy the env names.
 * @returns {Object}
 */
function deployConfServer() {
  const confServerPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/conf.server.json`;
  if (!fs.existsSync(confServerPath)) {
    throw new Error(`Server config not found: ${confServerPath}. Ensure DEFAULT_DEPLOY_ID is set.`);
  }
  return loadConfServerJson(confServerPath, { resolve: true });
}

/**
 * The host that owns the ItemLedger API, and its database: ledger records live there only.
 * @param {Object} confServer - Resolved server conf.
 * @param {string} [mongoHost] - Mongo host override.
 * @returns {{host:string,path:string,db:Object}}
 */
function ledgerDbContext(confServer, mongoHost) {
  const entry = Object.entries(confServer).find(([, paths]) => ownsApi(paths['/'], 'item-ledger'));
  if (!entry) throw new Error('No host of this deploy owns the item-ledger API');
  const [host] = entry;
  const db = { ...entry[1]['/'].db };
  db.host = mongoHost ? mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');
  return { host, path: '/', db };
}

/**
 * Opens the models a chain command writes: the Object Layer catalog of the Cyberia host and the
 * ItemLedger projection of the ItemLedger host, each in its own database.
 *
 * @async
 * @function connectDbForChain
 * @param {Object} params
 * @param {string} params.envPath   – path to .env file.
 * @param {string} [params.mongoHost] – optional mongo host override.
 * @returns {Promise<{ObjectLayer: import('mongoose').Model, CyberiaItemCatalog: import('mongoose').Model, ItemLedger: import('mongoose').Model, host: string, path: string, ledger: {host:string,path:string}}>}
 * @memberof CyberiaCLI
 */
async function connectDbForChain({ envPath, mongoHost }) {
  const host = process.env.DEFAULT_DEPLOY_HOST;
  const path = process.env.DEFAULT_DEPLOY_PATH;
  const confServer = deployConfServer();
  const db = { ...confServer[host][path].db };
  db.host = mongoHost ? mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');
  await DataBaseProviderService.load({ apis: ['object-layer', 'cyberia-item-catalog'], host, path, db });

  const ledger = ledgerDbContext(confServer, mongoHost);
  await DataBaseProviderService.load({ apis: ['item-ledger'], ...ledger });
  const ItemLedger = DataBaseProviderService.getModel('item-ledger', ledger);
  return { ...catalogModels({ host, path }), ItemLedger, host, path, ledger: { host: ledger.host, path: ledger.path } };
}

/** Closes both databases {@link connectDbForChain} opened. */
async function closeChainDb(connection) {
  for (const context of [connection, connection.ledger]) {
    try {
      await DataBaseProviderService.getProvider({ host: context.host, path: context.path }, 'mongoose').close();
    } catch (_) {
      /* ignore close errors */
    }
  }
}

/**
 * JSON-RPC endpoint of a Hardhat network name, as `hardhat/hardhat.config.js` resolves it.
 * @param {string} network
 * @returns {string}
 */
function rpcUrlOf(network) {
  const byNetwork = {
    'besu-ibft2': process.env.BESU_IBFT2_RPC_URL || 'http://127.0.0.1:8545',
    'besu-qbft': process.env.BESU_QBFT_RPC_URL || 'http://127.0.0.1:8545',
    'besu-k8s': process.env.BESU_K8S_RPC_URL || 'http://127.0.0.1:30545',
    hardhat: 'http://127.0.0.1:8545',
  };
  const url = byNetwork[network];
  if (!url) {
    logger.error(`Unknown network "${network}"; expected one of ${Object.keys(byNetwork).join(', ')}`);
    process.exit(1);
  }
  return url;
}

/**
 * Opens the ItemLedger projection models for the indexer, in the ItemLedger host's database.
 * @param {{envPath:string,mongoHost?:string}} params
 * @returns {Promise<{models:import('../src/api/item-ledger/item-ledger.indexer.js').IndexerModels,host:string,path:string}>}
 */
async function connectDbForIndexer({ envPath, mongoHost }) {
  const { host, path, db } = ledgerDbContext(deployConfServer(), mongoHost);
  const apis = ['item-ledger', 'item-ledger-transfer', 'item-ledger-balance', 'item-ledger-checkpoint'];
  await DataBaseProviderService.load({ apis, host, path, db });
  const models = Object.fromEntries(
    ['ItemLedger', 'ItemLedgerTransfer', 'ItemLedgerBalance', 'ItemLedgerCheckpoint'].map((name) => [
      name,
      DataBaseProviderService.getModel(name, { host, path }),
    ]),
  );
  return { models, host, path };
}

/**
 * Reads the deployment artifact `chain deploy-contract` wrote for a network, or exits.
 * @param {string} network - Hardhat network name.
 * @returns {{address:string,chainId:string,network:string}}
 */
function readContractDeployment(network) {
  const artifactPath = `./hardhat/deployments/${network}-ObjectLayerToken.json`;
  if (!fs.existsSync(artifactPath)) {
    logger.error(`Deployment artifact not found: ${artifactPath}. Run "cyberia chain deploy-contract" first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

/**
 * Records an on-chain registration as an ItemLedger binding. Opens the database when the
 * caller holds no connection; a database that is unreachable only costs the index entry.
 * @param {object} params
 * @param {{ItemLedger:object,host:string,path:string}|null} params.db - Open connection, or null.
 * @param {{address:string,chainId:string}} params.deployment - Contract deployment artifact.
 * @param {{objectLayerCid:string,itemId:string,tokenId:string,txHash:string}} params.binding
 * @param {string} params.envPath
 * @param {string} [params.mongoHost]
 * @param {boolean} [params.keepOpen=false] - Leave the connection open for further bindings.
 */
async function recordLedgerBinding({ db, deployment, binding, envPath, mongoHost, keepOpen = false }) {
  let connection = db;
  try {
    if (!connection) connection = await connectDbForChain({ envPath, mongoHost });
    const stored = await connection.ItemLedger.bind({
      ...binding,
      chainId: Number(deployment.chainId),
      contractAddress: deployment.address,
    });
    logger.info(
      `ItemLedger binding recorded: ${stored.objectLayerCid} → ${stored.chainId}/${stored.contractAddress}/${stored.tokenId}`,
    );
  } catch (bindErr) {
    logger.warn(
      `ItemLedger binding not recorded (${bindErr.message}); index it with "cyberia chain bind --cid ${binding.objectLayerCid}" once the database is reachable`,
    );
  } finally {
    if (connection && !keepOpen) await closeChainDb(connection);
  }
}

/**
 * The db configuration of the deploy the env names, as the CLI connects to it: the cluster
 * service host unless overridden, and the content partition of one release when asked.
 * @param {Object} params
 * @param {string} [params.envPath] - Env file; `./.env` when absent.
 * @param {string} [params.mongoHost] - Mongo host override.
 * @param {boolean} [params.dev] - Keep the development host and load `.env.development`.
 * @param {string} [params.release] - Release id whose database the content partition binds to.
 * @returns {{deployId:string,host:string,path:string,db:Object,valkey:Object,release:string,releaseDatabase:string,workspaceDatabase:string}}
 */
function resolveDeployDb({ envPath, mongoHost, dev, release } = {}) {
  const envFile = envPath || './.env';
  if (envPath && !fs.existsSync(envPath)) throw new Error(`Env file not found: ${envPath}`);
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile, override: true });
  if (dev && process.env.DEFAULT_DEPLOY_ID) {
    const devEnvPath = `./engine-private/conf/${process.env.DEFAULT_DEPLOY_ID}/.env.development`;
    if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath, override: true });
  }
  const deployId = process.env.DEFAULT_DEPLOY_ID;
  const host = process.env.DEFAULT_DEPLOY_HOST;
  const path = process.env.DEFAULT_DEPLOY_PATH;
  const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
  if (!fs.existsSync(confServerPath)) throw new Error(`Server config not found: ${confServerPath}`);
  const confServer = loadConfServerJson(confServerPath, { resolve: true });
  const hostConf = confServer[host][path];
  let { db } = hostConf;
  db.host = mongoHost ? mongoHost : dev ? db.host : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');
  let releaseDatabase = '';
  const workspaceDatabase = db.partitions?.[CONTENT_PARTITION]?.name ?? '';
  if (release) ({ db, database: releaseDatabase } = releaseDbConf(db, release));
  const owns = (api) => ownsApi(hostConf, api);
  return {
    deployId,
    host,
    path,
    db,
    valkey: hostConf.valkey,
    owns,
    consumes: consumedApisOf(hostConf),
    release: release || '',
    releaseDatabase,
    workspaceDatabase,
  };
}

/**
 * Refuses a destructive action unless the caller confirmed it with the deploy id it targets.
 * @param {Object} options - Parsed command options.
 * @param {string} deployId - The deploy the action would touch.
 * @param {string} action - What would be destroyed, for the message.
 */
function assertDestructiveConfirmation(options, deployId, action) {
  if (options.confirm === deployId) return;
  logger.error(
    `${action} destroys data of ${deployId}. Pass --confirm ${deployId} to run it. It is never part of a deploy.`,
  );
  process.exit(1);
}

/**
 * Runs the idempotent ObjectLayer identity migration under the Cyberia profile, links every
 * materialization to its definition by cid, binds every label that has one definition, and pins
 * persisted content to the definitions it means.
 * Exits when a label has several definitions and no binding.
 * @param {import('../src/projects/cyberia/object-layer-catalog.js').CatalogModels} models
 * @param {Object<string,import('mongoose').Model>} [contentModels={}] - Collections that pin references.
 * @param {{host:string,path:string}} [context] - Host the models belong to; the Object Layer
 *   authority states legacy documents canonical, a consumer states them drafts to publish.
 */
async function runIdentityMigration(models, contentModels = {}, context) {
  const result = await models.ObjectLayer.migrateIdentity({
    profile: CyberiaObjectLayerProfile,
    origin: isObjectLayerAuthority(context) ? 'canonical' : 'draft',
  });
  if (result.migrated > 0) logger.info(`Migrated ${result.migrated} ObjectLayer document(s) to content identity`);
  if (result.originsSet > 0) logger.info(`Stated the origin of ${result.originsSet} ObjectLayer document(s)`);
  if (result.indexesDropped.length > 0)
    logger.info(`Dropped legacy ObjectLayer index(es): ${result.indexesDropped.join(', ')}`);
  if (result.bindings > 0) logger.info(`Recorded ${result.bindings} legacy ledger binding(s) in ItemLedger`);
  for (const binding of result.unbound) {
    logger.warn(
      `Legacy on-chain ledger of "${binding.itemId}" (${binding.contractAddress} / ${binding.tokenId}) was dropped from the document; index it with "cyberia chain bind --cid ${binding.objectLayerCid}"`,
    );
  }
  // Materializations reference their definition by cid; their indexes hold one per definition.
  const materializations = {
    AtlasSpriteSheet: DataBaseProviderService.getModel('AtlasSpriteSheet', context),
    ObjectLayerRenderFrames: DataBaseProviderService.getModel('ObjectLayerRenderFrames', context),
  };
  const materialized = await models.ObjectLayer.migrateMaterializations(materializations);
  if (materialized.linked > 0)
    logger.info(`Linked ${materialized.linked} materialization(s) to their definition by cid`);
  if (materialized.unowned > 0)
    logger.warn(
      `Removed ${materialized.unowned} materialization(s) no definition referenced; sweep their Files with "node bin db --clean-fs-collection"`,
    );
  for (const [name, Model] of Object.entries(materializations)) {
    const indexesDropped = await Model.syncIndexes();
    if (indexesDropped.length > 0) logger.info(`Dropped legacy ${name} index(es): ${indexesDropped.join(', ')}`);
  }
  const dropped = await dropConsumerCanonicalPins({
    Ipfs: DataBaseProviderService.getModel('Ipfs', context),
    options: context,
  });
  if (dropped > 0)
    logger.info(`Dropped ${dropped} canonical-bytes pin record(s); the Object Layer authority holds them`);
  const seeded = await seedItemCatalog(models);
  if (seeded.bound > 0) logger.info(`Bound ${seeded.bound} item label(s) to their single definition`);
  if (seeded.ambiguous.length > 0) {
    for (const { itemId, cids } of seeded.ambiguous) {
      logger.error(`Item "${itemId}" has ${cids.length} definitions and no binding: ${cids.join(', ')}`);
    }
    logger.error(
      `Bind each label with POST /${API_BASE_PATH}/cyberia-item-catalog { itemId, objectLayerCid } before writing`,
    );
    process.exit(1);
  }

  await pinReferences(models, contentModels);
}

/**
 * Pins every unpinned quest and action reference to the definition its label is bound to now,
 * and moves every reference to a replaced definition onto its replacement.
 * Idempotent: any other pinned reference keeps its definition.
 * @param {import('../src/projects/cyberia/object-layer-catalog.js').CatalogModels} models
 * @param {Object<string,import('mongoose').Model>} contentModels - Collections that pin references.
 * @param {Map<string,string>} [replacements] - Replaced cid → the cid that replaces it.
 */
async function pinReferences(models, contentModels, replacements) {
  const references = await pinContentReferences({ models: { ...models, ...contentModels }, replacements });
  if (references.pinned > 0) logger.info(`Pinned ${references.pinned} content reference(s) to their definition`);
  for (const { collection, code, itemId } of references.unbound) {
    logger.warn(`${collection} "${code}" names unbound item "${itemId}"; bind the label to pin the reference`);
  }
}

/**
 * Rewrites a conf backup's `entityDefaults` into the reference shape the schema now stores.
 *
 * Backups written before the collection became the single owner embedded whole documents in the
 * conf. Those files are the only place that shape still exists, so it is converted here, at the
 * boundary where they enter — nothing downstream understands anything but an id.
 *
 * Each embedded entry is matched against the entity-type-default documents travelling in the same
 * backup, by entity type and live-item set. That lookup is safe precisely because it cannot see
 * the database: it can only ever resolve to a document this instance exported. An entry with no
 * counterpart is written to the collection so the reference it gets resolves to something.
 *
 * @param {object} confData - Parsed cyberia-instance-conf.json.
 * @param {string} backupDir - Backup root, holding cyberia-entity-type-defaults/.
 * @param {import('mongoose').Model} CyberiaEntityTypeDefault
 * @returns {Promise<object>} The conf, with `entityDefaults` as ids.
 */
const adoptEntityTypeDefaultRefs = async (confData, backupDir, CyberiaEntityTypeDefault) => {
  const entries = confData.entityDefaults || [];
  const embedded = entries.filter((entry) => entry && 'object' === typeof entry && entry.entityType);
  if (0 === embedded.length) return confData;

  const dir = `${backupDir}/cyberia-entity-type-defaults`;
  const exported = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => fs.readJsonSync(`${dir}/${file}`))
    : [];
  const liveKey = (doc) => `${doc.entityType}::${[...(doc.liveItemIds || [])].sort().join(',')}`;
  const byKey = new Map(exported.map((doc) => [liveKey(doc), doc]));

  const ids = [];
  let created = 0;
  for (const entry of entries) {
    if (!entry || 'object' !== typeof entry || !entry.entityType) {
      if (entry) ids.push(entry);
      continue;
    }
    const match = byKey.get(liveKey(entry));
    if (match?._id) {
      ids.push(match._id);
      continue;
    }
    const doc = await CyberiaEntityTypeDefault.create({
      entityType: entry.entityType,
      liveItemIds: entry.liveItemIds || [],
      deadItemIds: entry.deadItemIds || [],
      dropItemIds: entry.dropItemIds || [],
      inventoryItemsIds: entry.inventoryItemsIds || [],
      overrideItemsIdsState: entry.overrideItemsIdsState || [],
      behavior: entry.behavior || '',
    });
    ids.push(doc._id);
    created++;
  }
  confData.entityDefaults = ids;
  logger.info('Migrated embedded conf entityDefaults to collection references', {
    instanceCode: confData.instanceCode,
    references: ids.length,
    created,
  });
  return confData;
};

/** Default source of recorded `<name>.wav` + `<name>.json` pairs for `cyberia audio --import`. */
const DEFAULT_AUDIO_RECORDS_PATH = './cyberia-audio/records';

/**
 * Commander parser for the repeatable `<logic-event-id>:<audio-code>` flag.
 *
 * @function eventAudioBindingFactory
 * @param {string} flag - Flag name, used in the usage error.
 * @returns {(value: string, previous: Array<{event: string, code: string}>) => Array<{event: string, code: string}>} Accumulating parser.
 * @memberof CyberiaCLI
 */
const eventAudioBindingFactory =
  (flag) =>
  (value, previous = []) => {
    try {
      return previous.concat([parseEventAudioBinding(value)]);
    } catch {
      throw new InvalidArgumentError(`${flag} expects <logic-event-id>:<audio-code>`);
    }
  };

/** @type {Function} */
const logger = loggerFactory(import.meta);

/**
 * Reads the comma-separated item-id argument of the `ol` command.
 *
 * @param {string} [itemId] - The raw command argument.
 * @returns {string[]} Trimmed, non-empty item ids.
 */
const parseItemIds = (itemId) =>
  itemId
    ? itemId
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

/**
 * Applies the `ol` stat policy (`--normalize-stats`, `--random-stats`,
 * `--min-stat`, `--max-stat`) to one object layer before it is written.
 * Marks the path on a Mongoose document so the save carries it; a plain
 * payload needs no mark. A policy that changes nothing leaves the stats alone.
 *
 * @param {{ data: { item: { id: string, type: string }, stats: Object }, markModified?: Function }} objectLayer
 * @param {import('../src/projects/cyberia/stat-balance.js').StatPolicy} policy
 * @returns {boolean} Whether the stats were rewritten.
 */
const applyStatPolicy = (objectLayer, policy) => {
  if (!statPolicyActive(policy)) return false;
  const { stats, item } = objectLayer.data;
  objectLayer.data.stats = balanceStats({
    stats: typeof stats?.toObject === 'function' ? stats.toObject() : stats,
    itemType: item.type,
    policy,
  });
  if (typeof objectLayer.markModified === 'function') objectLayer.markModified('data.stats');
  logger.info(
    `Stats for '${objectLayer.data.item.id}' (${objectLayer.data.item.type}): ${JSON.stringify(objectLayer.data.stats)}`,
  );
  return true;
};

/**
 * Finds the asset type directory that holds one item id.
 *
 * @param {string} itemId - Object layer item id.
 * @returns {{ type: string, folder: string }|null} The type and folder, or null when absent.
 */
const findAssetFolder = (itemId) => {
  for (const type of Object.keys(itemTypes)) {
    const folder = `./src/client/public/cyberia/assets/${type}/${itemId}`;
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) return { type, folder };
  }
  return null;
};

/**
 * Resolves the stored item ids one `ol` action works on.
 *
 * The scope is the item-id argument, one instance, or the whole ObjectLayer
 * collection. Only ids the collection holds survive, so an action can never
 * create an object layer. Exits when the scope resolves to nothing.
 *
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Mongoose ObjectLayer model.
 * @param {string} [params.itemId] - The comma-separated item-id argument.
 * @param {string} [params.instance] - Instance code from `--instance`.
 * @param {string} params.host - Deploy host.
 * @param {string} params.path - Deploy path.
 * @param {string} params.action - The flag being served, for the log lines.
 * @returns {Promise<string[]>} Item ids to work on.
 */
const selectScopedItemIds = async ({ itemId, instance, host, path, action }) => {
  let storedItemIds;
  if (instance) {
    try {
      storedItemIds = await fetchInstanceObjectLayerItemIds(getInstanceModels({ host, path }), instance);
    } catch (instanceError) {
      logger.error(instanceError.message);
      process.exit(1);
    }
    logger.info(`Instance '${instance}' runs on ${storedItemIds.length} stored object layer(s)`);
  } else {
    storedItemIds = await boundItemIds(catalogModels({ host, path }));
  }

  const { itemIds, missingItemIds } = ObjectLayerEngine.selectStoredItemIds({
    storedItemIds,
    requestedItemIds: parseItemIds(itemId),
  });

  const scope = instance ? `instance '${instance}'` : 'the item catalog';
  if (missingItemIds.length > 0) logger.warn(`Not in ${scope}, skipped: ${missingItemIds.join(', ')}`);
  if (itemIds.length === 0) {
    logger.error(`No object layer of ${scope} matches the requested item-id(s) for ${action}`);
    process.exit(1);
  }
  return itemIds;
};

/** Gateway names the compose stack publishes beside the deploy's own domains. */
const CYBERIA_DOCKER_GATEWAY_ALIASES = ['cyberia-client', 'cyberia-server', 'engine-cyberia'];

/**
 * The public tree of every host the deploy serves, and the asset folders each one publishes to
 * the instances repository — the one place the image build takes public assets from.
 *
 * Every root file travels: the manifest, the icons, the microdata and the sitemap each host
 * serves from `/`. Beside them travel the named folders only, or every folder for a tree that
 * carries nothing but what its host requests. `cyberia` and `underpost` hold art the deploy
 * never serves — a gif bank, backgrounds, world sprites — so they name what they need.
 *
 * `cyberia` also fills the four clients that declare `publicCopyNonExistingFiles: "cyberia"`:
 * its icons and fonts are what draws their menus.
 */
const PUBLIC_ASSET_FOLDERS_ALL = '*';
const PUBLIC_ASSET_SYNC = Object.freeze({
  cyberia: ['ui-icons', 'cursor', 'fonts', 'icons', 'splash', 'templates', 'util'],
  underpost: ['splash', 'img', 'banner'],
  itemledger: PUBLIC_ASSET_FOLDERS_ALL,
  objectlayer: PUBLIC_ASSET_FOLDERS_ALL,
  cryptokoyn: PUBLIC_ASSET_FOLDERS_ALL,
});

/**
 * Publishes the public tree of every served host into the instances repository, which is where
 * the image build and the volume take them from.
 * @param {string} instancesRoot - Instances repository checkout.
 */
const publishPublicAssets = (instancesRoot) => {
  for (const [publicClientId, declaredFolders] of Object.entries(PUBLIC_ASSET_SYNC)) {
    const source = `./src/client/public/${publicClientId}`;
    const target = `${instancesRoot}/public/${publicClientId}`;
    if (!fs.existsSync(source)) {
      logger.warn('Public tree not present in this checkout, skipping', { publicClientId });
      continue;
    }
    for (const entry of fs.readdirSync(source, { withFileTypes: true }))
      if (entry.isFile()) fs.copySync(`${source}/${entry.name}`, `${target}/${entry.name}`);
    const assetFolders =
      declaredFolders === PUBLIC_ASSET_FOLDERS_ALL
        ? fs.existsSync(`${source}/assets`)
          ? fs.readdirSync(`${source}/assets`)
          : []
        : declaredFolders;
    for (const folder of assetFolders) {
      if (!fs.existsSync(`${source}/assets/${folder}`)) {
        logger.warn('Public asset folder not present in this checkout, skipping', { publicClientId, folder });
        continue;
      }
      fs.copySync(`${source}/assets/${folder}`, `${target}/assets/${folder}`);
    }
  }
};

/**
 * The names a host resolves to the compose proxy: the gateway aliases and every domain the
 * deploy serves, read from the conf the engine itself boots from.
 * @returns {string[]}
 */
const cyberiaDockerHostAliases = () => {
  const confServerPath = './engine-private/conf/dd-cyberia/conf.server.json';
  const domains = fs.existsSync(confServerPath) ? Object.keys(loadConfServerJson(confServerPath)) : [];
  return [...CYBERIA_DOCKER_GATEWAY_ALIASES, ...domains];
};

const installCyberiaDockerHostAliases = () => {
  const aliases = cyberiaDockerHostAliases();
  try {
    const { changed } = etcHostFactory(aliases, {
      append: true,
      blockId: 'dd-cyberia-docker-compose',
    });
    return { aliases, changed };
  } catch (error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM')
      throw new Error('Cannot update /etc/hosts for Cyberia Docker aliases. Re-run the workflow as root.');
    throw error;
  }
};

try {
  const program = new Command();
  registerStatCommands(program);

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
      'Rebuild the render of stored object layers and publish the definitions that name it, optionally capped to a dimension (default: auto-calculated based on frame count)',
    )
    .option('--show-atlas-sprite-sheet', 'Save and open the primary render of the definition an item-id is bound to')
    .option(
      '--import',
      'Import specific item-id(s) passed as comma-separated command argument (e.g. ol hatchet,sword --instance FOREST --import); with --from-directory, from the asset directory instead',
    )
    .option(
      '--from-directory',
      'Source --import and --import-types from src/client/public/cyberia/assets/<type>/<item-id>/<direction>/<frame>.png',
    )
    .option(
      '--sync-derived',
      'Derive the upscaled render and the idle preview again from the primary render of stored object layers; the render contract never changes (e.g. ol hatchet --sync-derived, or ol --sync-derived for all)',
    )
    .option(
      '--instance <instance-code>',
      'Limit --sync-derived and --to-atlas-sprite-sheet to the object layers one instance runs on, or make --import restore item(s) from that instance backup under engine-private (e.g. ol hatchet --instance FOREST --import)',
    )
    .option(
      '--normalize-stats',
      'Clamp every stat of each object layer the action writes into the semantic bounds of its item type',
    )
    .option(
      '--random-stats',
      'Regenerate every stat of each object layer the action writes, with random signed modifiers',
    )
    .option(
      '--min-stat <value>',
      'Lowest value --random-stats or --normalize-stats may leave (default: -100)',
      parseInt,
    )
    .option(
      '--max-stat <value>',
      'Highest value --random-stats or --normalize-stats may leave (default: 100)',
      parseInt,
    )
    .option(
      '--upscale <px-factor>',
      `Pixels per cell of the upscaled derived render; the factor is part of the render metadata, so on its own it rebuilds the render (default: ${DEFAULT_ATLAS_UPSCALE_FACTOR})`,
      parseInt,
    )
    .option(
      '--import-types [object-layer-type]',
      'Batch import by object layer type from the asset directory, needs --from-directory (e.g. skin,floors or all)',
    )
    .option('--show-frame [direction-frame]', 'View object layer frame for given item-id e.g. 08_0 (default: 08_0)')
    .option('--generate', 'Generate procedural object layers from semantic item-id (e.g. floor-desert)')
    .option('--count <count>', 'Shape element count multiplier for --generate (default: 3)', parseFloat)
    .option('--seed <seed>', 'Deterministic seed string for --generate (e.g. fx-42)')
    .option('--frame-index <frameIndex>', 'Starting frame index for --generate (default: 0)', parseInt)
    .option('--frame-count <frameCount>', 'Number of frames to generate for --generate (default: 1)', parseInt)
    .option('--density <density>', 'Density factor 0..1 for --generate (default: 0.5)', parseFloat)
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--drop', 'Drop existing data before importing (needs --confirm <deploy-id>; never part of a deploy)')
    .option('--confirm <deploy-id>', 'Confirm a destructive action against this deploy id')
    .option('--release <release-id>', 'Work on the content release database of this id instead of the workspace')
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
       * @param {boolean} options.fromDirectory - Source --import and --import-types from the asset directory.
       * @param {boolean} options.syncDerived - Refresh the derived renders of stored item(s).
       * @param {string} options.instance - Instance code whose object layers --sync-derived reprocesses.
       * @param {boolean} options.normalizeStats - Clamp the stats of every object layer the action writes to its type's bounds.
       * @param {boolean} options.randomStats - Regenerate the stats of every object layer the action writes.
       * @param {number} [options.minStat] - Lowest value --random-stats may draw.
       * @param {number} [options.maxStat] - Highest value --random-stats may draw.
       * @param {number} options.upscale - Pixels per cell of the upscaled render.
       * @param {boolean|string} options.importTypes - Object layer types to batch import (e.g., 'all', 'skin,floor') or `false`.
       * @param {boolean|string} options.showFrame - Direction-frame string (e.g., '08_0') or `true` for default.
       * @param {string} options.envPath - Path to the `.env` file.
       * @param {string} options.mongoHost - MongoDB host override.
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
          fromDirectory: false,
          syncDerived: false,
          instance: '',
          upscale: DEFAULT_ATLAS_UPSCALE_FACTOR,
          importTypes: false,
          normalizeStats: false,
          randomStats: false,
          showFrame: '',
          envPath: '',
          mongoHost: '',
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
        const upscaleFactor = options.upscale ?? DEFAULT_ATLAS_UPSCALE_FACTOR;
        if (!Number.isInteger(upscaleFactor) || upscaleFactor < 1) {
          logger.error('--upscale takes a whole pixel factor of 1 or more');
          process.exit(1);
        }

        const { deployId, host, path, db, owns } = resolveDeployDb(options);
        if (options.drop) assertDestructiveConfirmation(options, deployId, 'ol --drop');

        logger.info('env', {
          env: options.envPath,
          deployId,
          host,
          path,
          release: options.release || '',
        });

        // Content that pins Object Layer references is migrated with the collection, so its
        // collections load for every flow. `--instance` reads the world the runtime reads.
        const contentApis = ['cyberia-quest', 'cyberia-action'];
        const instanceApis = options.instance
          ? ['cyberia-instance', 'cyberia-instance-conf', 'cyberia-map', 'cyberia-skill', 'cyberia-entity-type-default']
          : [];

        await DataBaseProviderService.load({
          apis: [
            ...ITEM_DEFINITION_APIS,
            ...(owns('item-ledger') ? ['item-ledger'] : []),
            ...contentApis,
            ...instanceApis,
          ],
          host,
          path,
          db,
        });

        /** @type {import('mongoose').Model} */
        const ObjectLayerRenderFrames = DataBaseProviderService.getModel('object-layer-render-frames', { host, path });
        /** @type {import('mongoose').Model} */
        const AtlasSpriteSheet = DataBaseProviderService.getModel('atlas-sprite-sheet', { host, path });
        /** @type {import('mongoose').Model} */
        const File = DataBaseProviderService.getModel('file', { host, path });

        // A model handle binds to one connection, and the health monitor replaces that
        // connection when it drops. A batch that runs for minutes therefore resolves its
        // models per item instead of holding the handles it started with.
        const models = () => catalogModels({ host, path });
        const contentModels = () => ({
          CyberiaQuest: DataBaseProviderService.getModel('cyberia-quest', { host, path }),
          CyberiaAction: DataBaseProviderService.getModel('cyberia-action', { host, path }),
        });

        const rebuildAtlases = ObjectLayerEngine.selectAtlasRebuild(options);

        /* Bounds fail here, before any write, rather than on the first item. */
        const statPolicy = {
          normalize: !!options.normalizeStats,
          random: !!options.randomStats,
          min: options.minStat,
          max: options.maxStat,
        };
        if (statPolicyActive(statPolicy)) {
          try {
            resolveStatBounds('', statPolicy);
          } catch (boundsError) {
            logger.error(`--min-stat/--max-stat: ${boundsError.message}`);
            process.exit(1);
          }
        } else if (statPolicy.min !== undefined || statPolicy.max !== undefined) {
          logger.warn('--min-stat and --max-stat only bound --random-stats and --normalize-stats, ignored');
        }

        if (options.instance && !options.syncDerived && !rebuildAtlases && !options.import) {
          logger.warn(
            '--instance only narrows --sync-derived and --to-atlas-sprite-sheet, or sources --import, ignored',
          );
        }

        // Idempotent migration, run only before a flow that writes: every document carries
        // its content identity and every label its binding before a write lands. A read-only
        // subcommand stays free of side effects.
        if (
          options.import ||
          options.syncDerived ||
          options.importTypes ||
          options.drop ||
          options.generate ||
          rebuildAtlases
        ) {
          await runIdentityMigration(models(), contentModels(), { host, path });
        }

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

          // Every definition that carries a dropped label goes, with its label binding. The
          // asset tree is the source a re-import reads, so only --client-public removes it.
          const report = await purgeObjectLayers({
            options: { host, path, extension: cyberiaStudio },
            filter: isTargetedDrop ? { 'data.item.id': { $in: dropItemIds } } : {},
            pruneOrphans: true,
            assets: Boolean(options.clientPublic),
          });

          logger.info(
            `Dropped: ${report.objectLayers} ObjectLayer, ${report.renderFrames} RenderFrames, ${report.atlases} AtlasSpriteSheet, ${report.files} File (atlas)`,
          );
          logger.info(
            `IPFS cleanup: ${report.unpinned} CIDs unpinned, ${report.pinRecords} pin record(s) dropped, ${report.mfsPaths} MFS path(s) removed`,
          );
          for (const { cid, itemId: keptItemId } of report.kept)
            logger.warn(`Kept ${cid} ("${keptItemId}"): registered in ItemLedger`);
          if (options.gitClean) {
            shellExec(`cd src/client/public/cyberia && ${cli()} run clean .`);
            logger.info('Asset directory cleaned');
          }
        }

        // ── Handle --sync-derived (stored item-id(s)) ────────────────────
        // Refreshes the renders derived from the primary render: the upscaled render and
        // the idle preview. It reads its item ids from the collection, so it never creates an object
        // layer, and it never changes a render contract. With --random-stats every stored document
        // in scope is rewritten.
        if (options.syncDerived) {
          const selectedItemIds = await selectScopedItemIds({
            itemId,
            instance: options.instance,
            host,
            path,
            action: '--sync-derived',
          });

          logger.info(`Derived render refresh for ${selectedItemIds.length} stored item(s)`);
          const tally = { updated: 0, unchanged: 0, missing: 0, failed: [] };

          // Isolated per item, for the same reason the render rebuild is.
          for (const currentItemId of selectedItemIds) {
            try {
              let objectLayer = await findBoundDefinition(models(), currentItemId);
              if (objectLayer && applyStatPolicy(objectLayer, statPolicy)) {
                objectLayer = await ObjectLayerEngine.publishItemDefinition({
                  models: models(),
                  payload: ObjectLayerEngine.payloadOf(objectLayer),
                  options: { host, path },
                });
              }
              const { status } = await AtlasSpriteSheetStore.syncDerivedRenders({
                objectLayerCid: objectLayer?.cid,
                options: { host, path },
              });
              tally[status]++;
              if (status === 'missing')
                logger.warn(`No render stored for '${currentItemId}'; build it with --to-atlas-sprite-sheet`);
              else logger.info(`Derived renders ${status} for '${currentItemId}'`);
            } catch (syncError) {
              logger.error(`Derived render refresh failed for '${currentItemId}': ${syncError.message}`);
              tally.failed.push(currentItemId);
            }
          }

          logger.info(
            `Derived render refresh done: ${tally.updated} updated, ${tally.unchanged} unchanged, ` +
              `${tally.missing} without a render, ${tally.failed.length} failed`,
          );
          if (tally.failed.length > 0) {
            logger.warn(`Rerun for the failed item(s): ${tally.failed.join(',')}`);
          }
        }

        // ── Handle --import --instance: restore item(s) from the instance backup ──
        // The backup under engine-private is the authority for the item id: every document it
        // holds for the item replaces the database's, rather than regenerating from the asset
        // directory. The item never touches the stat policy — the backup already states its stats.
        if (options.import && options.instance) {
          const itemIds = parseItemIds(itemId);
          if (itemIds.length === 0) {
            logger.error(
              'item-id is required for --import --instance (e.g. ol hatchet,sword --instance FOREST --import)',
            );
            process.exit(1);
          }
          const backupDir = `./engine-private/cyberia-instances/${options.instance}`;
          if (!fs.existsSync(backupDir)) {
            logger.error(`No instance backup at ${backupDir}`);
            process.exit(1);
          }
          logger.info(`Restoring ${itemIds.length} item(s) from instance backup '${options.instance}'`);
          let restored = 0;
          const replacements = new Map();
          for (const currentItemId of itemIds) {
            try {
              const summary = await restoreObjectLayerBackup({
                backupDir,
                itemId: currentItemId,
                options: { host, path },
              });
              logger.info(`Restored '${currentItemId}' from backup`, summary);
              restored++;
              if (summary.replaced) replacements.set(summary.replaced, summary.cid);
            } catch (restoreError) {
              logger.error(`Restore failed for '${currentItemId}': ${restoreError.message}`);
            }
          }
          // The replaced atlases took their renders out of reach; prune what no atlas points at.
          await AtlasSpriteSheetStore.pruneOrphanRenders({ options: { host, path } });
          await pinReferences(models(), contentModels(), replacements);
          logger.info(`Instance restore done: ${restored}/${itemIds.length} item(s)`);
        }

        if (options.import && !options.instance === !options.fromDirectory) {
          logger.error(
            '--import takes exactly one source: --instance <code> for a backup, or --from-directory for the asset tree',
          );
          process.exit(1);
        }
        if (options.importTypes && !options.fromDirectory) {
          logger.error('--import-types reads the asset tree and needs --from-directory');
          process.exit(1);
        }

        // ── Handle --import --from-directory (specific item-id(s)) ────────
        if (options.import && options.fromDirectory) {
          const itemIds = parseItemIds(itemId);
          if (itemIds.length === 0) {
            logger.error(
              'item-id is required for --import --from-directory (comma-separated item IDs, e.g. ol hatchet,sword --from-directory --import)',
            );
            process.exit(1);
          }
          logger.info(`Importing specific item(s) from the asset directory: ${itemIds.join(', ')}`);

          for (const currentItemId of itemIds) {
            const found = findAssetFolder(currentItemId);
            if (!found) {
              logger.error(
                `Item-id '${currentItemId}' not found in any asset type directory (${Object.keys(itemTypes).join(', ')})`,
              );
              continue;
            }
            logger.info(`Found item '${currentItemId}' in type '${found.type}' at ${found.folder}`);

            const { objectLayerRenderFramesData, objectLayerData } =
              await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
                folder: found.folder,
                objectLayerType: found.type,
                objectLayerId: currentItemId,
              });
            applyStatPolicy(objectLayerData, statPolicy);

            // Write processed frames back to disk so WebP matches atlas
            await ObjectLayerEngine.writeStaticFrameAssets({
              basePaths: ['./src/client/public/cyberia/', `./public/${host}${path}`],
              itemType: found.type,
              itemId: currentItemId,
              objectLayerRenderFramesData,
              objectLayerData,
              cellPixelDim: upscaleFactor,
            });

            const objectLayer = await ObjectLayerEngine.persistObjectLayerDocuments({
              models: models(),
              objectLayerRenderFramesData,
              objectLayerData,
              persistOptions: { upscaleFactor, options: { host, path } },
            });

            console.log(objectLayer.toObject());
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

          // When importing all types, pre-fetch the bound labels so they are skipped entirely
          /** @type {Set<string>} */
          const existingItemIds = new Set();
          if (isImportAll) {
            for (const boundId of await boundItemIds(models())) existingItemIds.add(boundId);
            if (existingItemIds.size > 0) {
              logger.info(`Skipping ${existingItemIds.size} existing item(s): ${[...existingItemIds].join(', ')}`);
            }
          }

          for (const argItemType of argItemTypes) {
            await pngDirectoryIteratorByObjectLayerType(
              argItemType,
              async ({ path: framePath, objectLayerType, objectLayerId, direction, frame }) => {
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
                  applyStatPolicy(objectLayerData, statPolicy);

                  // Write processed frames back to disk so WebP matches atlas
                  const srcBasePath = './src/client/public/cyberia/';
                  const publicBasePath = `./public/${host}${path}`;
                  await ObjectLayerEngine.writeStaticFrameAssets({
                    basePaths: [srcBasePath, publicBasePath],
                    itemType: objectLayerType,
                    itemId: objectLayerId,
                    objectLayerRenderFramesData,
                    objectLayerData,
                    cellPixelDim: upscaleFactor,
                  });

                  objectLayers[objectLayerId] = { ...objectLayerData, objectLayerRenderFramesData };
                }
              },
            );
          }

          for (const objectLayerId of Object.keys(objectLayers)) {
            const entry = objectLayers[objectLayerId];

            // A bulk import of every type skips atlas generation; `--to-atlas-sprite-sheet`
            // or a targeted `--import` builds the atlas for an item that needs one.
            const objectLayer = await ObjectLayerEngine.persistObjectLayerDocuments({
              models: models(),
              objectLayerRenderFramesData: entry.objectLayerRenderFramesData,
              objectLayerData: { data: entry.data },
              persistOptions: { generateAtlas: !isImportAll, upscaleFactor, options: { host, path } },
            });

            console.log(objectLayer.toObject());
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

          const objectLayer = await findBoundDefinition(models(), itemId);
          if (!objectLayer) {
            logger.error(`Item "${itemId}" is not bound to an Object Layer definition`);
            process.exit(1);
          }
          const renderFrames = await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean();
          if (!renderFrames) {
            logger.error(`ObjectLayerRenderFrames not found for item: ${itemId}`);
            process.exit(1);
          }

          const objectLayerFrameDirections = getKeyframeDirectionsByCode(direction);
          if (objectLayerFrameDirections.length === 0) {
            logger.error(`Invalid direction code: ${direction}. Valid codes: 08, 18, 02, 12, 04, 14, 06, 16`);
            process.exit(1);
          }

          const objectLayerFrameDirection = objectLayerFrameDirections[0];
          const frames = renderFrames.frames[objectLayerFrameDirection];

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

          const outputPath = `./${objectLayer.data.item.id}_${showFrameInput}.png`;

          await buildImgFromTile({
            tile: {
              map_color: renderFrames.colors,
              frame_matrix: frames[frameIndexNum],
            },
            cellPixelDim: upscaleFactor,
            opacityFilter: (x, y, color) => 255,
            imagePath: outputPath,
          });

          logger.info(`Frame saved to: ${outputPath}`);
          shellExec(`firefox ${outputPath}`);
        }

        // ── Handle --to-atlas-sprite-sheet ───────────────────────────────
        // Rebuilds the render and publishes the definition that names it. The scope is the
        // same selection --sync-derived uses: the given item-id(s), one instance, or the whole
        // collection. A bare --upscale asks for the same rebuild: the factor is part of the
        // layout, so it is part of the render contract.
        if (rebuildAtlases) {
          /** @type {number|null} */
          const maxAtlasDim =
            options.toAtlasSpriteSheet === true || options.toAtlasSpriteSheet === undefined
              ? null
              : parseInt(options.toAtlasSpriteSheet) || null;

          if (maxAtlasDim !== null) {
            const sizeRecommendation =
              maxAtlasDim < 2048
                ? ' (Warning: May be too small for all frames)'
                : maxAtlasDim > 4096
                  ? ' (Large size: ensure GPU compatibility)'
                  : ' (Recommended size)';
            logger.info(`Max atlas dimension: ${maxAtlasDim}x${maxAtlasDim}${sizeRecommendation}`);
          }

          const selectedItemIds = await selectScopedItemIds({
            itemId,
            instance: options.instance,
            host,
            path,
            action: '--to-atlas-sprite-sheet',
          });

          logger.info(`Atlas rebuild for ${selectedItemIds.length} stored item(s) at ${upscaleFactor}px per cell`);
          const tally = { rebuilt: 0, skipped: 0, failed: [] };

          // One item at a time, isolated: a long batch runs through IPFS and can
          // meet a dropped database connection, and a rerun of a failed item is a
          // no-op for every item that already succeeded.
          for (const currentItemId of selectedItemIds) {
            try {
              const objectLayer = await findBoundDefinition(models(), currentItemId);
              const renderFrames = objectLayer
                ? await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean()
                : null;
              if (!renderFrames) {
                logger.warn(`No render frames stored for '${currentItemId}', skipped`);
                tally.skipped++;
                continue;
              }

              const rendered = await AtlasSpriteSheetStore.build({
                itemKey: currentItemId,
                objectLayerRenderFrames: renderFrames,
                upscaleFactor,
                maxAtlasDim,
                options: { host, path },
              });

              const { metadata } = rendered.atlas;
              const frameCount = Object.values(metadata.frames).reduce((sum, frames) => sum + frames.length, 0);
              logger.info(
                `Atlas for '${currentItemId}': ${metadata.atlasWidth}x${metadata.atlasHeight} cells, ` +
                  `${frameCount} frames packed`,
              );

              applyStatPolicy(objectLayer, statPolicy);
              await ObjectLayerEngine.publishItemDefinition({
                models: models(),
                payload: ObjectLayerEngine.payloadOf(objectLayer),
                renderFrames,
                rendered,
                options: { host, path },
              });
              tally.rebuilt++;
            } catch (rebuildError) {
              logger.error(`Atlas rebuild failed for '${currentItemId}': ${rebuildError.message}`);
              tally.failed.push(currentItemId);
            }
          }

          logger.info(
            `Atlas rebuild done: ${tally.rebuilt} rebuilt, ${tally.skipped} without render frames, ` +
              `${tally.failed.length} failed`,
          );
          if (tally.failed.length > 0) {
            logger.warn(`Rerun for the failed item(s): ${tally.failed.join(',')}`);
          }
        }

        // ── Handle --show-atlas-sprite-sheet ─────────────────────────────
        if (options.showAtlasSpriteSheet) {
          if (!itemId) {
            logger.error('item-id is required for --show-atlas-sprite-sheet');
            process.exit(1);
          }

          logger.info(`Looking up atlas sprite sheet for item: ${itemId}`);

          const objectLayer = await findBoundDefinition(models(), itemId);

          if (!objectLayer) {
            logger.error(`Item "${itemId}" is not bound to an Object Layer definition`);
            process.exit(1);
          }

          const atlasDoc = await AtlasSpriteSheet.findOne({ objectLayerCid: objectLayer.cid }).populate('fileId');

          if (!atlasDoc || !atlasDoc.fileId) {
            logger.error(
              `Atlas sprite sheet not found for item: ${itemId}. Generate it first with --to-atlas-sprite-sheet`,
            );
            process.exit(1);
          }

          const itemKey = objectLayer.data.item.id;
          const outputPath = `./${itemKey}-render.png`;

          await fs.writeFile(outputPath, atlasDoc.fileId.data);
          logger.info(`Primary render ${objectLayer.data.render?.cid} saved to: ${outputPath}`);

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
          applyStatPolicy(multiFrameResult.objectLayerData, statPolicy);

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
            cellPixelDim: upscaleFactor,
          });

          logger.info(`Wrote ${writtenFiles.length} asset file(s):`);
          for (const f of writtenFiles) {
            logger.info(`  → ${f}`);
          }

          // 3. Build the render, publish the definition, and store its render frames and atlas under its cid
          const objectLayer = await ObjectLayerEngine.persistObjectLayerDocuments({
            models: models(),
            objectLayerRenderFramesData: multiFrameResult.objectLayerRenderFramesData,
            objectLayerData: multiFrameResult.objectLayerData,
            persistOptions: { upscaleFactor, options: { host, path } },
          });

          logger.info(`ObjectLayer persisted to MongoDB: ${objectLayer._id} (item: ${objectLayer.data.item.id})`);
          logger.info(`Content hash: ${objectLayer.contentHash}`);
          logger.info(`Object Layer CID: ${objectLayer.cid}`);

          // 4. Mirror the upscaled render, else the primary render, into both static asset directories
          const atlasDoc = await AtlasSpriteSheet.findOne({ objectLayerCid: objectLayer.cid });
          if (atlasDoc) {
            const atlasFile = await File.findById(atlasDoc.upscaleFileId ?? atlasDoc.fileId);
            if (atlasFile?.data) {
              for (const bp of [srcBasePath, publicBasePath]) {
                const atlasOutputDir = nodePath.join(bp, 'assets', descriptor.itemType, uniqueItemId);
                await fs.ensureDir(atlasOutputDir);
                const atlasOutputPath = nodePath.join(atlasOutputDir, `${uniqueItemId}-atlas.png`);
                await fs.writeFile(atlasOutputPath, atlasFile.data);
                logger.info(
                  `Atlas sprite sheet written: ${atlasDoc.metadata.atlasWidth}x${atlasDoc.metadata.atlasHeight} cells → ${atlasOutputPath}`,
                );
              }
            }
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
    .option(
      '--drop',
      'Drop all documents associated with the instance code before importing or as a standalone action (needs --confirm <deploy-id>; never part of a deploy)',
    )
    .option('--confirm <deploy-id>', 'Confirm a destructive action against this deploy id')
    .option(
      '--release <release-id>',
      'Import into, or export from, the content release database of this id instead of the workspace',
    )
    .option(
      '--export-current-fallbackworld',
      'Capture the in-memory procedural fallback world as instance [instance-code]: materialize it into MongoDB (maps, conf, actions, quests, missing content defaults) and then export it',
    )
    .option(
      '--keep-fallback-codes',
      'With --export-current-fallbackworld, keep the raw fallback-map-* / canonical action-quest codes instead of namespacing them under the instance code',
    )
    .option(
      '--fallback-url <url>',
      'With --export-current-fallbackworld, capture the world a running engine currently serves (e.g. http://localhost:4001) instead of regenerating it locally',
    )
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .option(
      '--sync-entities',
      'Point the instance conf at every entity-type default its maps place and every skill their items trigger, dropping what the world no longer carries',
    )
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
        Underpost.repo.declareSafeDirectory('/home/dd/cyberia-instances');
        shellExec(`cd /home/dd/cyberia-instances && ${cli()} cmt . reset && ${cli()} run clean .`);
        shellExec(`cd /home/dd/engine/cyberia-server && ${cli()} cmt . reset && ${cli()} run clean .`);
        shellExec(`cd /home/dd/engine/cyberia-client && ${cli()} cmt . reset && ${cli()} run clean .`);
        return;
      }
      if (options.exportCurrentFallbackworld) {
        // A capture writes one named instance: no default list, no import in the
        // same run, and never the reserved code the in-memory world itself uses.
        if (!instanceCode || instanceCode.includes(',')) {
          logger.error('--export-current-fallbackworld requires a single [instance-code] to capture the world under');
          process.exit(1);
        }
        if (instanceCode === 'fallback') {
          logger.error('"fallback" is reserved for the in-memory world — capture it under a different instance code');
          process.exit(1);
        }
        if (options.import !== undefined) {
          logger.error('--export-current-fallbackworld cannot be combined with --import');
          process.exit(1);
        }
      }

      if (!instanceCode) {
        instanceCode = 'amethyst-strata-expansion,FOREST,TEST';
        logger.warn(`No instance code provided, defaulting to: ${instanceCode}`);
      }

      // An explicitly named env must exist: falling through to the ambient `./.env` resolves the
      // instance against whatever deployment was loaded last, which is not the one the caller named.
      if (options.envPath && !fs.existsSync(options.envPath)) {
        logger.error(`Env file not found: ${options.envPath}`);
        process.exit(1);
      }
      // A missing `./.env` is not an error: a pod receives its environment from a Secret.
      const envPath = options.envPath || './.env';
      if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

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
        // The instances checkout is cloned by the deploy user and driven by root during a deploy,
        // and git refuses to touch a tree owned by someone else until it is declared safe.
        Underpost.repo.declareSafeDirectory('/home/dd/cyberia-instances');
        if (options.publishBuild) {
          if (!fs.existsSync('/home/dd/cyberia-instances'))
            shellExec(`cd /home/dd && ${cli()} clone underpostnet/cyberia-instances`);
          else shellExec(`cd /home/dd/cyberia-instances && ${cli()} cmt --switch-repo underpostnet/cyberia-instances`);

          fs.mkdirpSync(`/home/dd/cyberia-instances/conf/dd-cyberia`);
          fs.copyFileSync(
            `./engine-private/conf/dd-cyberia/conf.server.json`,
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
          {
            // The published manifest is the deploy's, under the product's own identity — one
            // builder for every generated package.json in the project, so the instances repo
            // cannot drift from what the deploy and the product CLI declare.
            const deployPackagePath = deployPackagePathFactory('dd-cyberia');
            fs.writeFileSync(
              `/home/dd/cyberia-instances/conf/dd-cyberia/package.json`,
              `${JSON.stringify(
                buildDeployPackageJson({
                  deployId: 'dd-cyberia',
                  enginePackageJson: JSON.parse(fs.readFileSync(`./package.json`, 'utf-8')),
                  catalog: await loadDeployCatalog('dd-cyberia'),
                  currentPackageJson: JSON.parse(fs.readFileSync(deployPackagePath, 'utf-8')),
                  productIdentity: true,
                }),
                null,
                DEPLOY_MANIFEST_INDENT,
              )}\n`,
              'utf8',
            );
          }
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
          // The staged CLI package is a local image-build artifact, not a deployment manifest —
          // it must never be published into the instances repository.
          fs.copySync(`./src/runtime/engine-cyberia`, `/home/dd/cyberia-instances/deployments/engine-cyberia`, {
            filter: (src) => nodePath.basename(src) !== STAGED_CLI_PACKAGE,
          });
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
          publishPublicAssets(`/home/dd/cyberia-instances`);
          fs.mkdirpSync(`/home/dd/cyberia-instances/instances`);
          fs.mkdirpSync(`/home/dd/cyberia-instances/sagas`);
          for (const _instanceCode of instanceCode.split(',')) {
            if (fs.existsSync(`/home/dd/cyberia-instances/instances/${_instanceCode}`))
              shellExec(`rm -rf /home/dd/cyberia-instances/instances/${_instanceCode}`);
            if (fs.existsSync(`/home/dd/cyberia-instances/sagas/${_instanceCode}.json`))
              shellExec(`rm -rf /home/dd/cyberia-instances/sagas/${_instanceCode}.json`);
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

          if (!fs.existsSync('/home/dd/cyberia-instances/manifests'))
            fs.mkdirSync('/home/dd/cyberia-instances/manifests');
          fs.copySync('./cyberia-server/manifests', '/home/dd/cyberia-instances/manifests', { overwrite: true });
          fs.copySync('./cyberia-client/manifests', '/home/dd/cyberia-instances/manifests', { overwrite: true });
          if (!fs.existsSync('/home/dd/cyberia-instances/manifests/deployments/dd-cyberia-development'))
            fs.mkdirSync('/home/dd/cyberia-instances/manifests/deployments/dd-cyberia-development', {
              recursive: true,
            });
          fs.copySync(
            './manifests/deployment/dd-cyberia-development',
            '/home/dd/cyberia-instances/manifests/deployments/dd-cyberia-development',
            { overwrite: true },
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
        shellExec(`cd /home/dd/cyberia-instances && ${cli()} push . underpostnet/cyberia-instances`);
        return;
      }

      const { db, owns, releaseDatabase } = resolveDeployDb(options);
      if (options.drop) assertDestructiveConfirmation(options, deployId, 'instance --drop');

      logger.info('instance env', {
        env: options.envPath,
        deployId,
        host,
        path,
        release: options.release || '',
        releaseDatabase,
      });

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
          'cyberia-audio',
          'cyberia-map-audio-conf',
          ...ITEM_DEFINITION_APIS,
          ...(owns('item-ledger') ? ['item-ledger'] : []),
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
      const CyberiaAudio = DataBaseProviderService.getModel('cyberia-audio', { host, path });
      const CyberiaMapAudioConf = DataBaseProviderService.getModel('cyberia-map-audio-conf', { host, path });
      const ObjectLayer = DataBaseProviderService.getModel('object-layer', { host, path });
      const CyberiaItemCatalog = DataBaseProviderService.getModel('cyberia-item-catalog', { host, path });
      const File = DataBaseProviderService.getModel('file', { host, path });
      const models = { ObjectLayer, CyberiaItemCatalog };

      // ── CAPTURE CURRENT FALLBACK WORLD ──────────────────────────────
      //
      // The procedural fallback world lives only in engine memory. A capture
      // writes it to MongoDB under [instance-code], with the content
      // collections the fallback path serves from code defaults, so the export
      // below can back it up and `--import` can restore it.
      if (options.exportCurrentFallbackworld) {
        const { generateFallbackWorld } = await import('../src/api/cyberia-instance/cyberia-fallback-world.js');
        const { captureFallbackWorld } = await import('../src/api/cyberia-instance/cyberia-fallback-capture.js');

        let world;
        if (options.fallbackUrl) {
          // Staged fallback default items live only in the serving engine
          // process, so a faithful capture of a live world must read it back
          // over REST instead of regenerating it here.
          const base = options.fallbackUrl.replace(/\/+$/, '');
          const worldUrl = base.includes('/fallback-world')
            ? base
            : `${base}/${API_BASE_PATH}/cyberia-instance/fallback-world`;
          logger.info('Fetching live fallback world', { url: worldUrl });
          const response = await fetch(worldUrl);
          if (!response.ok) {
            logger.error(`Fallback world fetch failed: ${response.status} ${response.statusText}`, { url: worldUrl });
            await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
            process.exit(1);
          }
          const payload = await response.json();
          world = payload?.data ?? payload;
        } else {
          world = generateFallbackWorld();
        }

        if (!world?.instance || !Array.isArray(world.maps) || world.maps.length === 0) {
          logger.error('Fallback world payload has no maps — nothing to capture');
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
        }

        const capture = await captureFallbackWorld({
          models: {
            CyberiaInstance,
            CyberiaInstanceConf,
            CyberiaMap,
            CyberiaAction,
            CyberiaQuest,
            CyberiaSkill,
            CyberiaEntityTypeDefault,
            CyberiaDialogue,
            CyberiaMapAudioConf,
            CyberiaAudio,
            ObjectLayer,
          },
          world,
          instanceCode,
          keepFallbackCodes: !!options.keepFallbackCodes,
        });

        // Sprites are the one thing a capture cannot synthesise: without their
        // ObjectLayer documents the backup would export atlas-less items and
        // the restored world would render solid-colour rectangles.
        if (capture.missingObjectLayerItemIds.length > 0) {
          logger.error(
            `Capture aborted: ${capture.missingObjectLayerItemIds.length} referenced item id(s) have no ObjectLayer in MongoDB:`,
            capture.missingObjectLayerItemIds.join(', '),
            `— run \`node bin/cyberia ol ${capture.missingObjectLayerItemIds.join(',')} --from-directory --import\` (or ` +
              '`node bin/cyberia run-workflow import-default-items`) first.',
          );
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
        }

        logger.info('Captured fallback world into MongoDB', {
          code: instanceCode,
          mapCodes: capture.plan.instance.cyberiaMapCodes,
          actions: capture.plan.actions.length,
          quests: capture.plan.quests.length,
          audioConfs: capture.audio.audioConfs,
          objectLayerItemIds: capture.plan.itemIds.length,
        });

        // The capture is only half the command — fall through to the export so
        // it lands in ./engine-private/cyberia-instances/<instance-code>.
        if (options.export === undefined) options.export = true;
      }

      // ── SYNC ENTITY-TYPE DEFAULTS ───────────────────────────────────
      if (options.syncEntities) {
        const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode }, { host, path });
        logger.info(`sync-entities ${instanceCode}`, {
          maps: result.mapCodes.length,
          references: result.entityDefaults.length,
          ...(result.linked.length > 0 ? { linked: result.linked } : {}),
          ...(result.dropped.length > 0 ? { dropped: result.dropped } : {}),
          ...(result.skipped.length > 0 ? { claimedByAnotherInstance: result.skipped } : {}),
          ...(result.skills.length > 0 ? { skills: result.skills } : {}),
          ...(result.entitiesUpdated.length > 0
            ? { entitiesUpdated: result.entitiesUpdated.map(({ mapCode, entities }) => `${mapCode}:${entities}`) }
            : {}),
          ...(result.conflicts.length > 0 ? { notLinkedSameBuildAlreadyReferenced: result.conflicts } : {}),
          ...(result.duplicates.length > 0 ? { duplicateReferencesDeleteOne: result.duplicates } : {}),
        });
        if (options.export === undefined && !options.import && !options.drop) {
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          return;
        }
      }

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
        // The export is a projection of what this instance references, never an archive of
        // everything it once did: a document that drops out of the world has to leave the
        // directory with it, or the next import brings it back from the dead. Every directory is
        // emptied up front and rewritten from the database. `ipfs/` is derived state (the render
        // payloads are the atlas Files and metadata; the definition payload is the authority's),
        // so it is not part of a backup. `--conf` rewrites two files and leaves the rest.
        if (!options.conf) {
          for (const collection of [
            'maps',
            'cyberia-map-audio-confs',
            'cyberia-audio',
            'cyberia-quests',
            'cyberia-actions',
            'cyberia-skills',
            'cyberia-entity-type-defaults',
            'cyberia-dialogues',
            'object-layers',
            'render-frames',
            'atlas-sprite-sheets',
            'files',
          ]) {
            fs.emptyDirSync(`${backupDir}/${collection}`);
          }
          fs.removeSync(`${backupDir}/ipfs`);
        }
        logger.info('Exporting instance', { code: instanceCode, backupDir });

        // Helper: export a File document to the files/ directory
        const exportFileDoc = async (fileId, fileKey) => {
          if (!fileId) return;
          const file = await File.findById(fileId).lean();
          if (!file) return;
          fs.outputJsonSync(`${backupDir}/files/${fileKey}.json`, fileBackup(file), { spaces: 2 });
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
        //
        // Compact first: a reference whose entity-type default is gone cannot be exported, and
        // writing it into the backup would carry the dangling id into every world restored from
        // it. Dropping it here repairs the live conf and the backup in one step.
        await CyberiaEntityTypeDefaultService.compactInstanceRefs({ host, path }, { instanceCode });
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
          // `.lean()` skips the schema defaults and a document written before a bound tightened
          // may carry a value the schema now rejects; the backup is made whole and valid here so
          // it imports back as-is.
          ({ conf: instanceConf } = await CyberiaInstanceConfService.coerceToSchema(instanceConf, CyberiaInstanceConf));
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

        // 3a. Export the audio configuration of those maps, and the assets it binds.
        //     A CyberiaMapAudioConf belongs to one map, so it travels with the instance. A
        //     CyberiaAudio is global and shared by every map that binds its code, so it travels
        //     as a copy: the import upserts it by code and leaves other instances' bindings alone.
        //     The WAV rides along as an ordinary File document, keeping its _id so `fileId` still
        //     resolves after a restore.
        const audioConfs = await CyberiaMapAudioConf.find({ mapCode: { $in: [...mapCodes] } }).lean();
        if (audioConfs.length > 0) {
          fs.ensureDirSync(`${backupDir}/cyberia-map-audio-confs`);
          const audioCodes = new Set();
          for (const conf of audioConfs) {
            fs.writeJsonSync(`${backupDir}/cyberia-map-audio-confs/${encodeURIComponent(conf.mapCode)}.json`, conf, {
              spaces: 2,
            });
            if (conf.defaultMusic) audioCodes.add(conf.defaultMusic);
            for (const event of conf.events || []) if (event.audioCode) audioCodes.add(event.audioCode);
          }
          logger.info(`Exported ${audioConfs.length} CyberiaMapAudioConf document(s)`, {
            mapCodes: audioConfs.map((c) => c.mapCode),
          });

          const audioAssets = await CyberiaAudio.find({ code: { $in: [...audioCodes] } }).lean();
          if (audioAssets.length > 0) {
            fs.ensureDirSync(`${backupDir}/cyberia-audio`);
            for (const asset of audioAssets) {
              fs.writeJsonSync(`${backupDir}/cyberia-audio/${encodeURIComponent(asset.code)}.json`, asset, {
                spaces: 2,
              });
              if (asset.fileId) await exportFileDoc(asset.fileId, `audio-${asset.code}`);
            }
          }
          const missingAudioCodes = [...audioCodes].filter((code) => !audioAssets.some((asset) => asset.code === code));
          logger.info(`Exported ${audioAssets.length} CyberiaAudio document(s)`, {
            codes: audioAssets.map((a) => a.code),
          });
          if (missingAudioCodes.length > 0) {
            logger.warn(
              'Audio bindings reference codes with no imported CyberiaAudio document — ' +
                'run `node bin/cyberia audio --import` before restoring this backup',
              { codes: missingAudioCodes },
            );
          }
        }

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

        // 4. Export the entity-type defaults this instance's conf references, by _id.
        //    Membership is a reference, not a resemblance: matching on item ids used to pull in
        //    every document that happened to share a skin, so two instances built on the same
        //    art exported each other's wiring and overwrote it on the way back in.
        const referencedIds = (instanceConf?.entityDefaults || []).map((id) => String(id?._id ?? id));
        // Every reference resolves: the conf was compacted before it was read.
        const entityDefaults = referencedIds.length
          ? await CyberiaEntityTypeDefault.find({ _id: { $in: referencedIds } }).lean()
          : [];
        if (entityDefaults.length > 0) {
          fs.ensureDirSync(`${backupDir}/cyberia-entity-type-defaults`);
          for (const ed of entityDefaults) {
            fs.writeJsonSync(`${backupDir}/cyberia-entity-type-defaults/${ed._id}.json`, ed, { spaces: 2 });
          }
          logger.info(`Exported ${entityDefaults.length} CyberiaEntityTypeDefault document(s)`, {
            entityTypes: entityDefaults.map((ed) => ed.entityType),
          });
        }

        // 4b. Everything this instance names: what its maps place, what its entity-type defaults
        //     wire, and what its vendor / assembler / quest catalogs trade. Every one of these
        //     draws an icon somewhere, so the atlases travel with the backup even when no map
        //     entity wears them. One rule, shared with the boot payload and the editor's sync.
        const objectLayerItemIds = collectInstanceItemIds({ maps, entityDefaults, actions, quests });

        // 4c. Export the skills this instance runs: the collection owns the definitions, and one
        //     belongs here when its trigger item is an id the instance names — which is how a
        //     trigger only a quest objective or a vendor's shelf mentions still travels. Their
        //     summoned entities join the OL set, so this runs before the dialogue + OL queries.
        {
          const skills = selectInstanceSkills(await CyberiaSkill.find({}).lean(), objectLayerItemIds);
          if (skills.length > 0) {
            fs.ensureDirSync(`${backupDir}/cyberia-skills`);
            for (const skill of skills) {
              fs.writeJsonSync(`${backupDir}/cyberia-skills/${encodeURIComponent(skill.triggerItemId)}.json`, skill, {
                spaces: 2,
              });
            }
            for (const summoned of collectSummonedItemIds(skills)) objectLayerItemIds.add(summoned);
            logger.info(`Exported ${skills.length} CyberiaSkill document(s)`, {
              triggerItemIds: skills.map((sk) => sk.triggerItemId),
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
        const allSagas = [...new Map(sagaCodeMatch.map((s) => [s._id.toString(), s])).values()];
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

        // 5. Export object layers: each definition with its render frames, atlas and atlas Files.
        if (objectLayerItemIds.size > 0) {
          const objectLayers = await findBoundDefinitions(models, [...objectLayerItemIds]);
          for (const definition of objectLayers) {
            const exported = await exportObjectLayerBackup({ backupDir, definition, options: { host, path } });
            if (definition.data?.render?.cid && !exported.atlas)
              logger.warn(
                `'${exported.itemId}' names render ${definition.data.render.cid} but has no atlas to back up`,
              );
          }
          logger.info(`Exported ${objectLayers.length} ObjectLayer document(s)`, { itemIds: [...objectLayerItemIds] });
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

        // A restore writes object layers, so every stored document carries its content identity
        // and every label its binding first.
        await runIdentityMigration(models, { CyberiaQuest, CyberiaAction }, { host, path });

        // Item ids of this instance, from the imported object layers and the
        // instance doc. They backfill skills from DefaultSkillConfig when the
        // backup carries none.
        const importedItemIds = new Set();
        const restoreFailures = [];
        // Backup cid → the cid of the definition that replaced it: the content moves with it.
        const replacements = new Map();

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

            // Add the item ids the conf's referenced entity-type defaults name.
            const existingConf =
              (await CyberiaInstanceConf.findOne({ instanceCode }).lean()) ||
              (existingInstance.conf ? await CyberiaInstanceConf.findById(existingInstance.conf).lean() : null);
            if (existingConf) {
              // The conf names its entity-type defaults by _id; read the documents to reach their items.
              const referencedIds = (existingConf.entityDefaults || []).map((id) => String(id?._id ?? id));
              const referenced = referencedIds.length
                ? await CyberiaEntityTypeDefault.find({ _id: { $in: referencedIds } }).lean()
                : [];
              for (const itemId of collectInstanceItemIds({ entityDefaults: referenced })) dropOlItemIds.add(itemId);
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

              // A map's audio configuration belongs to that map. The assets it bound do not:
              // they are global and shared, so they stay.
              const audioConfResult = await CyberiaMapAudioConf.deleteMany({ mapCode: { $in: [...dropMapCodes] } });
              if (audioConfResult.deletedCount > 0)
                logger.info(`Dropped ${audioConfResult.deletedCount} CyberiaMapAudioConf document(s)`);

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

            // A conf stores no skills: the ones this instance ran are the ones its own items trigger.
            // What those summon is drawn by this instance alone, so it joins the drop surface and is
            // then protected by the same shared-with-another-map check as everything else.
            for (const itemId of collectSummonedItemIds(
              selectInstanceSkills(await CyberiaSkill.find({}).lean(), dropOlItemIds),
            )) {
              dropOlItemIds.add(itemId);
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
              // The asset tree stays: it is the source this instance re-imports from.
              const report = await purgeObjectLayers({
                options: { host, path, extension: cyberiaStudio },
                filter: { 'data.item.id': { $in: [...dropOlItemIds] } },
                assets: false,
              });
              logger.info(
                `Dropped: ${report.objectLayers} ObjectLayer, ${report.renderFrames} RenderFrames, ${report.atlases} AtlasSpriteSheet, ${report.files} File (atlas)`,
              );
              logger.info(
                `IPFS cleanup: ${report.unpinned} CIDs unpinned, ${report.pinRecords} pin record(s) dropped, ${report.mfsPaths} MFS path(s) removed`,
              );
              for (const { cid, itemId: keptItemId } of report.kept)
                logger.warn(`Kept ${cid} ("${keptItemId}"): registered in ItemLedger`);
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
            // Made whole and valid before the live conf is touched, so a backup the schema
            // rejects resets to defaults rather than leaving the instance with no conf.
            const { conf: confData } = await CyberiaInstanceConfService.coerceToSchema(
              await adoptEntityTypeDefaultRefs(fs.readJsonSync(confImportPath), backupDir, CyberiaEntityTypeDefault),
              CyberiaInstanceConf,
            );
            if (confData._id) await CyberiaInstanceConf.deleteOne({ _id: confData._id });
            await CyberiaInstanceConf.deleteOne({ instanceCode: confData.instanceCode });
            // Bump updatedAt so the world version changes and the server
            // re-applies the config without a restart.
            confData.updatedAt = new Date();
            importedConf = await CyberiaInstanceConf.create(confData);
            logger.info('Imported CyberiaInstanceConf', { instanceCode: confData.instanceCode });
          } else {
            logger.warn(`CyberiaInstanceConf backup not found: ${confImportPath}`);
          }

          // --conf must not recreate the CyberiaInstance: that would overwrite
          // cyberiaMapCodes, portals and itemIds from a possibly stale backup.
          // Update the conf ref and bump updatedAt, so the world version changes
          // and the server re-applies the config.
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

        // 1. Import File documents: thumbnails, previews, audio. Atlas renders travel with their
        //    object layer, below.
        const filesDir = `${backupDir}/files`;
        if (fs.existsSync(filesDir)) {
          const atlasFileIds = atlasFileIdsOf(backupDir);
          const fileFiles = fs.readdirSync(filesDir).filter((f) => f.endsWith('.json'));
          let fileCount = 0;
          for (const f of fileFiles) {
            const fileData = fileFromBackup(fs.readJsonSync(`${filesDir}/${f}`));
            if (atlasFileIds.has(String(fileData._id))) continue;
            // preserveUUID: delete any existing doc with this _id then create with exact _id
            await File.deleteOne({ _id: fileData._id });
            await File.create(fileData);
            fileCount++;
          }
          logger.info(`Imported ${fileCount} File document(s)`);
        }

        // 2. Import object layers: each definition with its render frames, atlas, atlas Files,
        //    render payloads and static frame PNGs, from one restore shared with `ol --instance`.
        const olDir = `${backupDir}/object-layers`;
        if (fs.existsSync(olDir)) {
          let staticFiles = 0;
          let rebuilt = 0;
          for (const file of fs.readdirSync(olDir).filter((f) => f.endsWith('.json'))) {
            const olItemId = nodePath.basename(file, '.json');
            try {
              const restored = await restoreObjectLayerBackup({ backupDir, itemId: olItemId, options: { host, path } });
              importedItemIds.add(olItemId);
              staticFiles += restored.staticFiles;
              if (restored.rebuilt) rebuilt++;
              if (restored.replaced) replacements.set(restored.replaced, restored.cid);
            } catch (restoreError) {
              restoreFailures.push(olItemId);
              logger.error(`Restore failed for '${olItemId}': ${restoreError.message}`);
            }
          }
          // The replaced atlases took their renders out of reach; prune what no atlas points at.
          await AtlasSpriteSheetStore.pruneOrphanRenders({ options: { host, path } });
          logger.info(
            `Imported ${importedItemIds.size} ObjectLayer document(s) (${rebuilt} render(s) rebuilt), ${staticFiles} static frame PNG(s)`,
          );
        }

        // 3. Import maps (preserveUUID: delete by code then create with exact _id)
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

        // 3a. Import audio assets, then the map bindings that reference them by code. Assets are
        //     upserted by code (they are global and may already be present from another import);
        //     their File documents were restored above with their original _id, so `fileId` still
        //     resolves. A binding whose asset is absent is kept: the code is the reference, and
        //     importing the asset later makes it play.
        const audioAssetsDir = `${backupDir}/cyberia-audio`;
        if (fs.existsSync(audioAssetsDir)) {
          const assetFiles = fs.readdirSync(audioAssetsDir).filter((f) => f.endsWith('.json'));
          let assetCount = 0;
          let replacedFiles = 0;
          for (const file of assetFiles) {
            const assetData = fs.readJsonSync(`${audioAssetsDir}/${file}`);
            if (!assetData.code) {
              logger.warn(`Skipping CyberiaAudio backup without code: ${file}`);
              continue;
            }
            // The asset this restore supersedes may hold different bytes under a different
            // fileId. Replacing the document without dropping that blob leaves it referenced by
            // nothing — an orphan `db clean-fs` would later have to sweep.
            const superseded = await CyberiaAudio.find({
              $or: [{ code: assetData.code }, ...(assetData._id ? [{ _id: assetData._id }] : [])],
            }).lean();
            await CyberiaAudio.deleteOne({ code: assetData.code });
            if (assetData._id) await CyberiaAudio.deleteOne({ _id: assetData._id });
            await CyberiaAudio.create(assetData);
            for (const old of superseded) {
              if (!old.fileId || String(old.fileId) === String(assetData.fileId)) continue;
              if (await File.findByIdAndDelete(old.fileId)) replacedFiles++;
            }
            assetCount++;
          }
          logger.info(`Imported ${assetCount} CyberiaAudio document(s)`, {
            ...(replacedFiles > 0 ? { replacedFiles } : {}),
          });
        }

        const audioConfsDir = `${backupDir}/cyberia-map-audio-confs`;
        if (fs.existsSync(audioConfsDir)) {
          const confFiles = fs.readdirSync(audioConfsDir).filter((f) => f.endsWith('.json'));
          let audioConfCount = 0;
          for (const file of confFiles) {
            const confData = fs.readJsonSync(`${audioConfsDir}/${file}`);
            if (!confData.mapCode) {
              logger.warn(`Skipping CyberiaMapAudioConf backup without mapCode: ${file}`);
              continue;
            }
            await CyberiaMapAudioConf.deleteOne({ mapCode: confData.mapCode });
            if (confData._id) await CyberiaMapAudioConf.deleteOne({ _id: confData._id });
            await CyberiaMapAudioConf.create(confData);
            audioConfCount++;
          }
          logger.info(`Imported ${audioConfCount} CyberiaMapAudioConf document(s)`);
        }

        // 4. Import CyberiaInstanceConf (skillRules, equipmentRules, entityDefaults, etc.)
        const confImportPath = `${backupDir}/cyberia-instance-conf.json`;
        if (fs.existsSync(confImportPath)) {
          // Made whole and valid before the live conf is touched, so a backup the schema
          // rejects resets to defaults rather than leaving the instance with no conf.
          const { conf: confData } = await CyberiaInstanceConfService.coerceToSchema(
            await adoptEntityTypeDefaultRefs(fs.readJsonSync(confImportPath), backupDir, CyberiaEntityTypeDefault),
            CyberiaInstanceConf,
          );
          if (confData._id) await CyberiaInstanceConf.deleteOne({ _id: confData._id });
          await CyberiaInstanceConf.deleteOne({ instanceCode: confData.instanceCode });
          await CyberiaInstanceConf.create(confData);
          logger.info('Imported CyberiaInstanceConf', { instanceCode: confData.instanceCode });
        } else {
          logger.warn(`CyberiaInstanceConf backup not found: ${confImportPath}`);
        }

        // 5. Import instance (preserveUUID: delete by code then create with exact _id)
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

        // 6. Import CyberiaDialogue documents
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

        // 6b. Import CyberiaQuest documents (overwrite by code).
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

        // 6c. Import CyberiaAction documents (overwrite by code).
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

        // 6d. Import CyberiaSkill documents (own model, overwrite by triggerItemId).
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

        // 8d-bis. Import CyberiaEntityTypeDefault documents by _id (preserveUUID), which is how
        //     the conf's references keep resolving after a restore. Only the documents this
        //     backup carries are touched: overwriting by an (entityType, liveItemIds) "natural
        //     key" clobbered another instance's document whenever two worlds shared a skin.
        const entityDefaultsDir = `${backupDir}/cyberia-entity-type-defaults`;
        if (fs.existsSync(entityDefaultsDir)) {
          const entityDefaultFiles = fs.readdirSync(entityDefaultsDir).filter((f) => f.endsWith('.json'));
          let entityDefaultCount = 0;
          for (const file of entityDefaultFiles) {
            const edData = fs.readJsonSync(`${entityDefaultsDir}/${file}`);
            if (!edData.entityType || !edData._id) {
              logger.warn(`Skipping CyberiaEntityTypeDefault backup without entityType or _id: ${file}`);
              continue;
            }
            await CyberiaEntityTypeDefault.deleteOne({ _id: edData._id });
            await CyberiaEntityTypeDefault.create(edData);
            entityDefaultCount++;
          }
          logger.info(`Imported ${entityDefaultCount} CyberiaEntityTypeDefault document(s)`);
        }

        // A conf can reference a default this backup does not carry — an older backup, or one
        // exported before the reference existed. Restoring that reference would recreate the
        // orphan the export just removed, so the restored conf is compacted too.
        await CyberiaEntityTypeDefaultService.compactInstanceRefs({ host, path }, { instanceCode });

        // 6e. Backfill missing skills from the canonical DefaultSkillConfig. Old
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

        // 6f. Import CyberiaSaga documents (overwrite by code).
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

        // 7. Pin the imported quests and actions to the definitions their labels are bound to now,
        //    and move what they pin from a replaced backup definition onto its replacement.
        await pinReferences(models, { CyberiaQuest, CyberiaAction }, replacements);

        if (restoreFailures.length > 0) {
          logger.error(`Instance import incomplete: ${restoreFailures.length} object layer(s) failed`, {
            items: restoreFailures,
          });
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
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

          // Add the item ids the conf's referenced entity-type defaults name.
          const existingConf =
            (await CyberiaInstanceConf.findOne({ instanceCode }).lean()) ||
            (existingInstance.conf ? await CyberiaInstanceConf.findById(existingInstance.conf).lean() : null);
          if (existingConf) {
            // The conf names its entity-type defaults by _id; read the documents to reach their items.
            const referencedIds = (existingConf.entityDefaults || []).map((id) => String(id?._id ?? id));
            const referenced = referencedIds.length
              ? await CyberiaEntityTypeDefault.find({ _id: { $in: referencedIds } }).lean()
              : [];
            for (const itemId of collectInstanceItemIds({ entityDefaults: referenced })) dropOlItemIds.add(itemId);
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

            // A map's audio configuration belongs to that map; the shared assets it bound do not.
            const audioConfResult = await CyberiaMapAudioConf.deleteMany({ mapCode: { $in: [...dropMapCodes] } });
            if (audioConfResult.deletedCount > 0)
              logger.info(`Dropped ${audioConfResult.deletedCount} CyberiaMapAudioConf document(s)`);
          }

          // A conf stores no skills: the ones this instance ran are the ones its own items trigger.
          // What those summon is drawn by this instance alone, so it joins the drop surface and is
          // then protected by the same shared-with-another-map check as everything else.
          for (const itemId of collectSummonedItemIds(
            selectInstanceSkills(await CyberiaSkill.find({}).lean(), dropOlItemIds),
          )) {
            dropOlItemIds.add(itemId);
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

            // The asset tree stays: it is the source this instance re-imports from.
            const report = await purgeObjectLayers({
              options: { host, path, extension: cyberiaStudio },
              filter: { 'data.item.id': { $in: [...dropOlItemIds] } },
              assets: false,
            });
            logger.info(
              `Dropped: ${report.objectLayers} ObjectLayer, ${report.renderFrames} RenderFrames, ${report.atlases} AtlasSpriteSheet, ${report.files} File (atlas)`,
            );
            logger.info(
              `IPFS cleanup: ${report.unpinned} CIDs unpinned, ${report.pinRecords} pin record(s) dropped, ${report.mfsPaths} MFS path(s) removed`,
            );
            for (const { cid, itemId: keptItemId } of report.kept)
              logger.warn(`Kept ${cid} ("${keptItemId}"): registered in ItemLedger`);
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

  const runAudioCommand = async (audioCode, options = {}) => {
    const assignments = {
      ...(options.setDefaultMusic === undefined ? {} : { defaultMusic: options.setDefaultMusic }),
      events: options.setEvent ?? [],
    };
    const configuring = assignments.defaultMusic !== undefined || assignments.events.length > 0;

    if (configuring && !options.map) {
      logger.error('--map <map-code> is required to apply --set-default-music/--set-event');
      process.exit(1);
    }
    if (!options.import && !options.map) {
      logger.error('Nothing to do: pass --import, or --map <map-code> to read or configure a map');
      process.exit(1);
    }

    if (options.envPath && !fs.existsSync(options.envPath)) {
      logger.error(`Env file not found: ${options.envPath}`);
      process.exit(1);
    }
    const envPath =
      options.envPath || `./engine-private/conf/dd-cyberia/.env.${options.dev ? 'development' : 'production'}`;
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

    const deployId = process.env.DEFAULT_DEPLOY_ID;
    const host = process.env.DEFAULT_DEPLOY_HOST;
    const path = process.env.DEFAULT_DEPLOY_PATH;
    const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
    if (!fs.existsSync(confServerPath)) {
      logger.error(`Server config not found: ${confServerPath}. Ensure DEFAULT_DEPLOY_ID is set.`);
      process.exit(1);
    }
    const confServer = loadConfServerJson(confServerPath, { resolve: true });
    const { db } = confServer[host][path];
    db.host = options.mongoHost
      ? options.mongoHost
      : options.dev
        ? db.host
        : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

    logger.info('env', { env: envPath, deployId, host, path });

    await DataBaseProviderService.load({
      apis: ['cyberia-audio', 'cyberia-instance', 'cyberia-map', 'cyberia-map-audio-conf', 'file'],
      host,
      path,
      db,
    });

    try {
      if (options.seedWorld) {
        // An instance names its own maps, in its own order; without one the fallback world is the
        // world being scored. Either way the bank and the rotation are the same.
        const result = options.instance
          ? await seedInstanceAudio(
              { instanceCode: options.instance, recordsPath: options.recordsPath },
              { host, path },
            )
          : await seedFallbackAudio({ recordsPath: options.recordsPath }, { host, path });
        logger.info(
          `seed-audio${options.instance ? ` --instance ${options.instance}` : ''}: ` +
            `${result.assets.length} assets, ${result.maps.length} maps`,
        );
      } else if (options.import) {
        const recordsPath = options.recordsPath || DEFAULT_AUDIO_RECORDS_PATH;
        const codes = audioCode
          ? audioCode
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean)
          : null;
        const imported = await CyberiaAudioService.importRecords({ recordsPath, codes }, { host, path });
        logger.info(`audio --import: imported ${imported.length} asset(s) from ${recordsPath}`);
      }

      if (options.map) {
        /** @type {import('mongoose').Model} */
        const CyberiaMap = DataBaseProviderService.getModel('cyberia-map', { host, path });
        if (!(await CyberiaMap.exists({ code: options.map }))) {
          throw new Error(`cyberia-map not found for code="${options.map}"`);
        }

        if (configuring) {
          const conf = await CyberiaMapAudioConfService.assign(
            { mapCode: options.map, ...assignments },
            { host, path },
          );
          logger.info(`audio --map: updated audio configuration for "${options.map}"`, {
            defaultMusic: conf.defaultMusic || null,
            events: conf.events.map(({ logicEventId, audioCode: code }) => `${logicEventId}:${code}`),
          });
        } else {
          const conf = await CyberiaMapAudioConfService.getByMapCode(options.map, { host, path });
          if (!conf) logger.warn(`No audio configuration for map "${options.map}"`);
          else console.log(JSON.stringify(conf, null, 2));
        }
      }
    } finally {
      await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    }
  };

  // ── audio: import cyberia-audio assets and configure per-map audio ──
  program
    .command('audio [audio-code]')
    .option('--import', 'Import <name>.wav + <name>.json pairs into MongoDB (all pairs when no id is given)')
    .option(
      '--records-path <records-path>',
      `Records directory to import from (default: ${DEFAULT_AUDIO_RECORDS_PATH})`,
    )
    .option('--map <map-code>', 'Target cyberia-map code to read or configure')
    .option('--set-default-music <audio-code>', 'Set the default background music of --map')
    .option(
      '--set-event <logic-event-id:audio-code>',
      'Bind an audio asset to a logic event e.g. combat:combat or shoot:shoot, repeatable',
      eventAudioBindingFactory('--set-event'),
      [],
    )
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .description('Import cyberia-audio assets into MongoDB and configure cyberia-map audio')
    .action(runAudioCommand);

  // ── generate-saga: Top-Down PCG guided by LLMs (Semantic Reverse-Engineering) ──
  program
    .command('generate-saga')
    .option(
      '--prompt <theme>',
      'Theme seed for the saga. If omitted, a distinct theme is auto-generated from the Cyberia base lore',
    )
    .option('--import <file>', 'Load a previously generated payload file (the shape --out writes) into the database')
    .option('--model <model>', 'Gemini model id (default: gemma-4-26b-a4b-it)')
    .option('--timeout <ms>', 'Per-request timeout in ms (default: 10000)', (v) => parseInt(v, 10))
    .option('--thinking-level <level>', 'Gemini thinking level: low | medium | high (default: high)')
    .option(
      '--lore-path <path>',
      'Override path to the base-lore doc (default: src/client/public/docs/cyberia/explanation/lore.md)',
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

        logger.info('generate-saga', { deployId, host, path });

        await DataBaseProviderService.load({
          apis: [
            'cyberia-saga',
            'cyberia-map',
            'cyberia-quest',
            'cyberia-dialogue',
            'cyberia-action',
            'cyberia-skill',
            'cyberia-instance',
            ...ITEM_DEFINITION_APIS,
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
          ...catalogModels({ host, path }),
        };
      }

      try {
        // A saga writes the definitions its items run on, so the collection migrates first.
        if (models)
          await runIdentityMigration(
            catalogModels({ host, path }),
            { CyberiaQuest: models.CyberiaQuest, CyberiaAction: models.CyberiaAction },
            { host, path },
          );
        if (options.import) {
          await importSaga({
            file: options.import,
            models,
            context: { host, path },
            dryRun: !!options.dryRun,
            out: options.out,
          });
        } else {
          await generateSaga({
            prompt: options.prompt,
            models,
            context: { host, path },
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
      'Register an Object Layer on-chain via the deployed ObjectLayerToken contract.\n' +
        'The token id is derived from the canonical Object Layer CID. Give the CID directly with --cid,\n' +
        'or name a Cyberia item with --item-id --from-db to register its current definition.\n' +
        'The ItemLedger binding is recorded in MongoDB when the database is reachable.',
    )
    .option('--cid <olCid>', 'Canonical Object Layer CID to register')
    .option('--item-id <itemId>', 'Cyberia item id whose current definition is registered (with --from-db)')
    .option('--from-db', 'Resolve the canonical CID of --item-id from the ObjectLayer collection')
    .option('--supply <supply>', 'Initial token supply (1 = non-fungible, >1 = semi-fungible)', '1')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deployment = readContractDeployment(options.network);
      const contractAddress = deployment.address;

      let objectLayerCid = options.cid || '';
      let itemId = options.itemId || '';
      let db = null;

      if (options.fromDb || (!objectLayerCid && itemId)) {
        if (!itemId) {
          logger.error('--from-db needs --item-id');
          process.exit(1);
        }
        try {
          db = await connectDbForChain({ envPath: options.envPath, mongoHost: options.mongoHost });
          const resolved = await resolveItemIdentity({
            itemId,
            models: db,
            options: { host: db.host, path: db.path },
          });
          if (objectLayerCid && objectLayerCid !== resolved.cid) {
            logger.warn(
              `--cid "${objectLayerCid}" differs from the current definition of "${itemId}" (${resolved.cid}).`,
            );
            logger.warn('Using the current definition.');
          }
          objectLayerCid = resolved.cid;
          logger.info(`Object Layer CID of "${itemId}": ${objectLayerCid}`);
          logger.info(`  Content hash: ${resolved.contentHash}`);
        } catch (dbErr) {
          logger.error(`Failed to resolve the Object Layer CID from the database: ${dbErr.message}`);
          process.exit(1);
        }
      }

      if (!objectLayerCid) {
        logger.error('Give --cid <olCid>, or --item-id <itemId> --from-db');
        process.exit(1);
      }

      const tokenId = objectLayerTokenId(objectLayerCid);
      const contentHash = `0x${sha256HexFromCid(objectLayerCid)}`;
      logger.info(`Registering Object Layer ${objectLayerCid} on contract ${contractAddress}`);
      logger.info(`  Content hash: ${contentHash}`);
      logger.info(`  Token id: ${tokenId}`);
      logger.info(`  Supply: ${options.supply}`);

      const registerScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const [deployer] = await ethers.getSigners();
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const tx = await token.registerObjectLayer(deployer.address, '${contentHash}', ${options.supply}, '0x');
          const receipt = await tx.wait();
          console.log('Registered tokenId:', (await token.computeTokenId('${contentHash}')).toString());
          console.log('Object Layer CID:', await token.getObjectLayerCid('${tokenId}'));
          console.log('Tx hash:', receipt.hash);
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_register_tmp.js';
      fs.writeFileSync(tmpScript, registerScript, 'utf8');
      let txHash = '';
      try {
        const result = shellExec(
          `cd hardhat && npx hardhat run scripts/_cli_register_tmp.js --network ${options.network}`,
          {
            silent: false,
            silentOnError: true,
          },
        );
        if (result.code !== 0) {
          logger.error('On-chain registration failed');
          process.exit(1);
        }
        txHash = /Tx hash: (0x[0-9a-fA-F]+)/.exec(result.stdout || '')?.[1] || '';
      } finally {
        fs.removeSync(tmpScript);
      }

      await recordLedgerBinding({
        db,
        deployment,
        binding: { objectLayerCid, itemId, tokenId, txHash },
        envPath: options.envPath,
        mongoHost: options.mongoHost,
      });
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
    .description('Read the ERC-1155 balance of an address: an ownership record projected from chain state')
    .requiredOption('--address <address>', 'Ethereum address to query')
    .option('--token-id <tokenId>', 'ERC-1155 token ID (default: 0 = CKY)', '0')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deployment = readContractDeployment(options.network);
      const contractAddress = deployment.address;

      const balanceScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const balance = await token.balanceOf('${options.address}', ${options.tokenId});
          const objectLayerCid = await token.getObjectLayerCid(${options.tokenId});
          let totalSupply;
          try { totalSupply = await token['totalSupply(uint256)'](${options.tokenId}); } catch (_) { totalSupply = 'N/A'; }
          console.log(JSON.stringify({
            balance: balance.toString(),
            objectLayerCid: objectLayerCid || '',
            totalSupply: totalSupply.toString(),
          }));
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_balance_tmp.js';
      fs.writeFileSync(tmpScript, balanceScript, 'utf8');
      try {
        const result = shellExec(
          `cd hardhat && npx hardhat run scripts/_cli_balance_tmp.js --network ${options.network}`,
          {
            silent: true,
            silentOnError: true,
          },
        );
        if (result.code !== 0) {
          logger.error(`Balance read failed: ${result.stderr || result.stdout}`);
          process.exit(1);
        }
        const read = JSON.parse((result.stdout || '').trim().split('\n').pop());
        const ownership = ownershipRecord({
          chainId: deployment.chainId,
          contractAddress,
          tokenId: options.tokenId,
          ownerAddress: options.address,
          balance: read.balance,
        });
        console.log(
          JSON.stringify(
            {
              ...ownership,
              objectLayerCid: read.objectLayerCid || (ownership.tokenId === '0' ? '(cryptokoyn)' : '(unregistered)'),
              formattedBalance:
                ownership.tokenId === '0' ? `${Number(read.balance) / 1e18} CKY` : `${read.balance} units`,
              totalSupply: read.totalSupply,
            },
            null,
            2,
          ),
        );
      } finally {
        fs.removeSync(tmpScript);
      }
    });

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
      'Batch-register Object Layers on-chain in a single transaction.\n' +
        'Each item names a canonical CID ("cid") or a Cyberia item id ("itemId"). With --from-db every\n' +
        'item id resolves to the CID of its current definition. Bindings are recorded in ItemLedger.',
    )
    .requiredOption(
      '--items <json>',
      'JSON array of items: [{"cid":"bafk...","supply":1}, {"itemId":"wood","supply":500000}]',
    )
    .option('--from-db', 'Resolve the CID of every "itemId" from the ObjectLayer collection')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override')
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

      const deployment = readContractDeployment(options.network);
      const contractAddress = deployment.address;

      let db = null;
      const needsDb = options.fromDb || items.some((item) => !item.cid && item.itemId);
      if (needsDb) {
        try {
          db = await connectDbForChain({ envPath: options.envPath, mongoHost: options.mongoHost });
        } catch (dbErr) {
          logger.error(`Failed to connect to database: ${dbErr.message}`);
          process.exit(1);
        }
        for (const item of items) {
          if (!item.itemId) continue;
          try {
            const resolved = await resolveItemIdentity({
              itemId: item.itemId,
              models: db,
              options: { host: db.host, path: db.path },
            });
            if (item.cid && item.cid !== resolved.cid) {
              logger.warn(
                `Item "${item.itemId}": cid "${item.cid}" differs from its current definition ${resolved.cid}. Using the current one.`,
              );
            }
            item.cid = resolved.cid;
            logger.info(`  "${item.itemId}" → ${resolved.cid}`);
          } catch (resolveErr) {
            logger.error(`Failed to resolve "${item.itemId}": ${resolveErr.message}`);
            process.exit(1);
          }
        }
      }

      const missing = items.filter((item) => !item.cid);
      if (missing.length) {
        logger.error(`Every item needs a "cid" or an "itemId" with --from-db: ${JSON.stringify(missing)}`);
        process.exit(1);
      }

      const contentHashes = items.map((item) => `0x${sha256HexFromCid(item.cid)}`);
      const supplies = items.map((item) => item.supply || 1);

      logger.info(`Batch-registering ${items.length} Object Layers on contract ${contractAddress}`);
      for (const item of items) {
        logger.info(`  - ${item.cid} (token id: ${objectLayerTokenId(item.cid)}, supply: ${item.supply || 1})`);
      }

      const batchScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const [deployer] = await ethers.getSigners();
          const token = await ethers.getContractAt('ObjectLayerToken', '${contractAddress}');
          const contentHashes = ${JSON.stringify(contentHashes)};
          const supplies = ${JSON.stringify(supplies)};
          const tx = await token.batchRegisterObjectLayers(deployer.address, contentHashes, supplies, '0x');
          const receipt = await tx.wait();
          console.log('Batch register tx hash:', receipt.hash);
          for (const contentHash of contentHashes) {
            const tokenId = await token.computeTokenId(contentHash);
            const balance = await token.balanceOf(deployer.address, tokenId);
            console.log('  ' + (await token.getObjectLayerCid(tokenId)) + ' -> tokenId:', tokenId.toString(), '  balance:', balance.toString());
          }
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_batch_register_tmp.js';
      fs.writeFileSync(tmpScript, batchScript, 'utf8');
      let txHash = '';
      try {
        const result = shellExec(
          `cd hardhat && npx hardhat run scripts/_cli_batch_register_tmp.js --network ${options.network}`,
          { silent: false, silentOnError: true },
        );
        if (result.code !== 0) {
          logger.error('On-chain batch registration failed');
          process.exit(1);
        }
        txHash = /tx hash: (0x[0-9a-fA-F]+)/.exec(result.stdout || '')?.[1] || '';
      } finally {
        fs.removeSync(tmpScript);
      }

      for (const item of items) {
        await recordLedgerBinding({
          db,
          deployment,
          binding: {
            objectLayerCid: item.cid,
            itemId: item.itemId || '',
            tokenId: objectLayerTokenId(item.cid),
            txHash,
          },
          envPath: options.envPath,
          mongoHost: options.mongoHost,
          keepOpen: true,
        });
      }
      if (db) await closeChainDb(db);
    });

  chain
    .command('bind')
    .description(
      'Index an Object Layer that is already registered on-chain as an ItemLedger binding.\n' +
        'Reads the contract to confirm the registration; sends no transaction.',
    )
    .requiredOption('--cid <olCid>', 'Canonical Object Layer CID')
    .option('--item-id <itemId>', 'Semantic label to keep on the binding for discovery', '')
    .option('--tx-hash <txHash>', 'Registration transaction hash, when known', '')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });

      const deployment = readContractDeployment(options.network);
      const tokenId = objectLayerTokenId(options.cid);

      const readScript = `
        import hre from 'hardhat';
        const { ethers } = await hre.network.connect();
        async function main() {
          const token = await ethers.getContractAt('ObjectLayerToken', '${deployment.address}');
          console.log(JSON.stringify({ cid: await token.getObjectLayerCid('${tokenId}') }));
        }
        main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
      `;
      const tmpScript = './hardhat/scripts/_cli_bind_tmp.js';
      fs.writeFileSync(tmpScript, readScript, 'utf8');
      try {
        const result = shellExec(
          `cd hardhat && npx hardhat run scripts/_cli_bind_tmp.js --network ${options.network}`,
          {
            silent: true,
            silentOnError: true,
          },
        );
        if (result.code !== 0) {
          logger.error(`Contract read failed: ${result.stderr || result.stdout}`);
          process.exit(1);
        }
        const { cid } = JSON.parse((result.stdout || '').trim().split('\n').pop());
        if (cid !== options.cid) {
          logger.error(`Token id ${tokenId} is not registered for ${options.cid} on ${deployment.address}`);
          process.exit(1);
        }
      } finally {
        fs.removeSync(tmpScript);
      }

      await recordLedgerBinding({
        db: null,
        deployment,
        binding: { objectLayerCid: options.cid, itemId: options.itemId, tokenId, txHash: options.txHash },
        envPath: options.envPath,
        mongoHost: options.mongoHost,
      });
    });

  chain
    .command('index')
    .description(
      'Project ObjectLayerToken events into the ItemLedger collections: registrations, transfers\n' +
        'and balances per owner. Idempotent and checkpointed: a rerun resumes after the last block it projected.',
    )
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--confirmations <blocks>', 'Blocks behind the head the projection stays', '0')
    .option('--batch-size <blocks>', 'Blocks per log query', '2000')
    .option('--follow <ms>', 'Keep projecting, polling the head every <ms> milliseconds')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });
      const deployment = readContractDeployment(options.network);
      const { JsonRpcProvider } = await import('ethers');
      const provider = new JsonRpcProvider(rpcUrlOf(options.network), Number(deployment.chainId));
      const { models, host, path } = await connectDbForIndexer(options);
      const indexer = new ItemLedgerIndexer({
        provider,
        chainId: Number(deployment.chainId),
        contractAddress: deployment.address,
        models,
        confirmations: Number(options.confirmations),
        batchSize: Number(options.batchSize),
        startBlock: Number(deployment.blockNumber || 0),
      });
      const run = async () => {
        const summary = await indexer.sync();
        logger.info(
          `Indexed blocks ${summary.fromBlock}..${summary.toBlock}: ${summary.registrations} registration(s), ${summary.transfers} transfer leg(s)`,
        );
      };
      try {
        await run();
        while (options.follow) {
          await new Promise((resolve) => setTimeout(resolve, Number(options.follow)));
          await run();
        }
      } finally {
        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      }
    });

  chain
    .command('reconcile')
    .description('Reread every projected balance from the contract and correct the rows that drifted')
    .option('--network <network>', 'Hardhat network name', 'besu-k8s')
    .option('--env-path <envPath>', 'Env path', './.env')
    .option('--mongo-host <mongoHost>', 'MongoDB host override')
    .action(async (options) => {
      if (fs.existsSync(options.envPath)) dotenv.config({ path: options.envPath, override: true });
      const deployment = readContractDeployment(options.network);
      const { JsonRpcProvider } = await import('ethers');
      const provider = new JsonRpcProvider(rpcUrlOf(options.network), Number(deployment.chainId));
      const { models, host, path } = await connectDbForIndexer(options);
      try {
        const indexer = new ItemLedgerIndexer({
          provider,
          chainId: Number(deployment.chainId),
          contractAddress: deployment.address,
          models,
        });
        const result = await indexer.reconcile();
        logger.info(`Reconciled ${result.checked} balance row(s); ${result.corrected.length} corrected`);
        for (const row of result.corrected) {
          logger.warn(`Token ${row.tokenId} of ${row.ownerAddress}: projected ${row.projected}, chain ${row.chain}`);
        }
      } finally {
        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      }
    });

  // ─── Content releases ───────────────────────────────────────────────────────
  // A deploy builds a candidate into its own database, validates it there and promotes it by
  // pointer. Nothing here drops a served database; `prune` removes retired ones only.
  const contentRelease = program
    .command('content-release')
    .description('Versioned Cyberia content: build a candidate release, validate, promote, roll back, prune');

  const RELEASE_APIS = [
    'cyberia-content-release',
    'cyberia-server-registry',
    'file',
    'cyberia-item-catalog',
    'object-layer',
    'atlas-sprite-sheet',
    'cyberia-quest',
    'cyberia-action',
    'cyberia-map',
    'cyberia-entity-type-default',
    'cyberia-instance',
    'cyberia-instance-conf',
  ];

  const releaseEnvOptions = (command) =>
    command
      .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
      .option('--mongo-host <mongo-host>', 'Mongo host override')
      .option('--dev', 'Force development environment');

  /** Opens the release ledger (runtime database) and, when a release is named, that release's content. */
  const openReleases = async (options, releaseId = '') => {
    const context = resolveDeployDb({ ...options, release: releaseId });
    await DataBaseProviderService.load({ apis: RELEASE_APIS, host: context.host, path: context.path, db: context.db });
    const provider = DataBaseProviderService.getProvider({ host: context.host, path: context.path }, 'mongoose');
    return { ...context, models: provider.models, connection: provider.connection, provider };
  };

  const printChecks = (validation) => {
    for (const entry of validation.checks) {
      const line = `${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name} (${entry.count})`;
      if (entry.ok) logger.info(line);
      else logger.error(line);
      for (const message of entry.findings) (entry.ok ? logger.info : logger.error)(`      ${message}`);
    }
  };

  /** Validates the content the models read: a release, recorded in the ledger, or the workspace. */
  const runValidation = async ({ models, host, path, consumes }, releaseId = '', { publish = false } = {}) => {
    const publication = publish ? await publishContentRelease(models, { options: { host, path, consumes } }) : null;
    const validation = await validateContentRelease(models, { options: { host, path, consumes } });
    if (publication) {
      validation.checks.unshift(publication);
      validation.ok = validation.ok && publication.ok;
      logger.info(`Published ${publication.created} new definition(s) to the Object Layer authority`);
    }
    printChecks(validation);
    if (!releaseId) {
      logger.info(`The workspace is ${validation.ok ? 'valid' : 'invalid'}`);
      return validation;
    }
    const { manifest, dependencies, ...report } = validation;
    await models.CyberiaContentRelease.updateOne(
      { releaseId },
      { $set: { validation: report, manifest, dependencies, status: validation.ok ? 'validated' : 'invalid' } },
    );
    logger.info(`Release ${releaseId} is ${validation.ok ? 'validated' : 'invalid'}`);
    return validation;
  };

  releaseEnvOptions(
    contentRelease
      .command('build <release-id>')
      .option('--bootstrap', 'Promote the release when it validates and no release is active yet (first deploy)')
      .option('--from <source>', 'backups (the instance backups) or workspace (what the portal authored)', 'backups')
      .option(
        '--instances <codes>',
        'Comma-separated instance codes to import from the backups',
        'amethyst-strata-expansion,FOREST,TEST',
      )
      .description('Build the release database from its source, publish its definitions, then validate it'),
  ).action(async (releaseId, options = {}) => {
    const id = assertReleaseId(releaseId);
    if (!['backups', 'workspace'].includes(options.from)) {
      logger.error(`--from takes backups or workspace, not "${options.from}"`);
      process.exit(1);
    }
    const release = await openReleases(options, id);
    const { models, host, path, deployId, releaseDatabase, workspaceDatabase } = release;
    const instances = options.instances
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    const existing = await models.CyberiaContentRelease.findOne({ releaseId: id }).lean();
    // A promoted release is immutable: a rerun of the same deploy finds it built and leaves it.
    if (existing && (existing.status === 'active' || existing.status === 'retired')) {
      logger.info(`Release ${id} is ${existing.status}; already built, nothing to do`);
      await release.provider.close();
      process.exit(0);
    }
    const commit = shellExec('git rev-parse --short HEAD', { stdout: true, silent: true, silentOnError: true }).trim();
    await models.CyberiaContentRelease.updateOne(
      { releaseId: id },
      {
        $set: {
          database: releaseDatabase,
          status: 'candidate',
          instances,
          source: {
            from: options.from,
            engineVersion: JSON.parse(fs.readFileSync('./package.json', 'utf8')).version,
            commit,
            builtAt: new Date(),
            builtBy: os.userInfo().username,
          },
        },
        $setOnInsert: { releaseId: id },
      },
      { upsert: true },
    );
    logger.info(
      `Building release ${id} of ${deployId} into ${releaseDatabase} from the ${options.from}`,
      options.from === 'workspace' ? { workspace: workspaceDatabase } : { instances },
    );

    if (options.from === 'workspace') {
      const copied = await materializeWorkspace({
        connection: release.connection,
        workspace: workspaceDatabase,
        database: releaseDatabase,
        apis: release.db.partitions[CONTENT_PARTITION].apis,
      });
      logger.info('Copied the workspace', copied);
      // The release carries the instances the workspace holds, not the backup list.
      await models.CyberiaContentRelease.updateOne(
        { releaseId: id },
        { $set: { instances: (await models.CyberiaInstance.find({}, { code: 1 }).lean()).map((doc) => doc.code) } },
      );
    } else {
      const passthrough = [
        options.envPath ? `--env-path ${options.envPath}` : '',
        options.mongoHost ? `--mongo-host ${options.mongoHost}` : '',
        options.dev ? '--dev' : '',
      ]
        .filter(Boolean)
        .join(' ');
      // `instance --import` restores one backup directory per call.
      for (const code of instances)
        shellExec(`${process.execPath} ${process.argv[1]} instance ${code} --import --release ${id} ${passthrough}`);
    }

    const validation = await runValidation(release, id, { publish: true });
    // A first deploy has no release to keep serving, so a validated one goes live at once.
    if (validation.ok && options.bootstrap && !(await models.CyberiaContentRelease.active()))
      await promoteContentRelease(models.CyberiaContentRelease, id);
    await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
    process.exit(validation.ok ? 0 : 1);
  });

  releaseEnvOptions(
    contentRelease
      .command('validate [release-id]')
      .description('Run every check on a release and record the report; on the workspace when no release is named'),
  ).action(async (releaseId, options = {}) => {
    const id = releaseId ? assertReleaseId(releaseId) : '';
    const release = await openReleases(options, id);
    if (id && !(await release.models.CyberiaContentRelease.exists({ releaseId: id }))) {
      logger.error(`Release ${id} does not exist`);
      process.exit(1);
    }
    const validation = await runValidation(release, id);
    await release.provider.close();
    process.exit(validation.ok ? 0 : 1);
  });

  releaseEnvOptions(
    contentRelease
      .command('retire')
      .description('Stop serving the active release: the runtime serves the workspace, and rollback re-promotes it'),
  ).action(async (options = {}) => {
    const release = await openReleases(options);
    const retired = await retireContentRelease(release.models.CyberiaContentRelease);
    const base = release.db.partitions?.[CONTENT_PARTITION]?.name ?? '';
    logger.info(`Retired release: ${retired.releaseId}; the runtime serves ${base}`);
    await release.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('promote <release-id>')
      .description('Serve a validated release. Running engines rebind and reload the game servers'),
  ).action(async (releaseId, options = {}) => {
    const release = await openReleases(options);
    const { active, retired } = await promoteContentRelease(release.models.CyberiaContentRelease, releaseId);
    logger.info(
      `Active release: ${active.releaseId} (${active.database})${retired ? `; rollback target: ${retired.releaseId}` : ''}`,
    );
    await release.provider.close();
  });

  releaseEnvOptions(
    contentRelease.command('rollback').description('Serve the release that was active before the current one'),
  ).action(async (options = {}) => {
    const release = await openReleases(options);
    const { active, retired } = await rollbackContentRelease(release.models.CyberiaContentRelease);
    logger.info(
      `Active release: ${active.releaseId} (${active.database})${retired ? `; retired: ${retired.releaseId}` : ''}`,
    );
    await release.provider.close();
  });

  releaseEnvOptions(
    contentRelease.command('status').description('The active release and what this ledger holds'),
  ).action(async (options = {}) => {
    const release = await openReleases(options);
    const active = await release.models.CyberiaContentRelease.active();
    const base = release.db.partitions?.[CONTENT_PARTITION]?.name ?? '';
    logger.info(
      active
        ? `Active release: ${active.releaseId} (${active.database})`
        : `No release promoted; the runtime serves ${base}`,
    );
    // Ledger rows are data, so they go to stdout plainly, never through the logger.
    for (const entry of await release.models.CyberiaContentRelease.find({}).sort({ createdAt: -1 }).lean())
      console.log(contentReleaseRowFactory(entry));
    await release.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('prune')
      .option('--keep <n>', 'Retired releases to keep, newest first', parseInt, 2)
      .description(
        'Drop the databases of retired releases beyond --keep. The active release and the rollback target always stay',
      ),
  ).action(async (options = {}) => {
    const release = await openReleases(options);
    const removed = await pruneContentReleases({
      CyberiaContentRelease: release.models.CyberiaContentRelease,
      connection: release.connection,
      context: { host: release.host, path: release.path },
      baseDatabase: release.db.partitions?.[CONTENT_PARTITION]?.name ?? '',
      keep: options.keep,
    });
    logger.info(removed.length ? `Pruned: ${removed.join(', ')}` : 'Nothing to prune');
    await release.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('activate')
      .description('Bind this process to the active release (what a running engine does on start and on promotion)'),
  ).action(async (options = {}) => {
    const release = await openReleases(options);
    const result = await activateContentRelease({ host: release.host, path: release.path });
    logger.info(
      result ? `Serving ${result.releaseId || '(base)'} from ${result.database}` : 'No content partition on this host',
    );
    await release.provider.close();
  });

  const catalog = program.command('catalog').description('The Cyberia item catalog: the definition each label runs on');

  releaseEnvOptions(
    catalog
      .command('reconcile')
      .description('Unbind every label whose definition the Object Layer authority no longer offers. Idempotent'),
  ).action(async (options = {}) => {
    const { host, path, db, consumes } = resolveDeployDb(options);
    await DataBaseProviderService.load({ apis: ['object-layer', 'cyberia-item-catalog'], host, path, db });
    const result = await reconcileItemCatalog(catalogModels({ host, path }), { host, path, consumes });
    for (const { itemId, objectLayerCid, reason } of result.unbound)
      logger.info(`Unbound ${itemId} from ${objectLayerCid}: ${reason}`);
    logger.info(`Checked ${result.checked} bindings, unbound ${result.unbound.length}`);
    process.exit(0);
  });

  const cache = program.command('cache').description('The platform cache of this deploy host in Valkey');

  releaseEnvOptions(
    cache
      .command('clear')
      .description('Remove every cached value of this deploy host in this environment. MongoDB is untouched'),
  ).action(async (options = {}) => {
    const { host, path, valkey } = resolveDeployDb(options);
    if (!valkey) throw new Error(`${host}${path} declares no valkey connection`);
    await createValkeyConnection({ host, path }, valkey);
    const removed = await CacheService.clear({ host, path });
    logger.info(`Removed ${removed} cached values of ${host}${path} (${process.env.NODE_ENV || 'development'})`);
    process.exit(0);
  });

  const runner = program.command('run-workflow').description('Run a Cyberia script from the "scripts" directory');

  runner
    .command('seed-audio')
    .option('--records-path <path>', 'Recorded WAV and manifest directory', DEFAULT_AUDIO_RECORDS_PATH)
    .option('--records-only', 'Record the WAV and manifest pairs without touching the database')
    .option(
      '--instance <instance-code>',
      "Configure that instance's maps instead of the fallback world's, in its own cyberiaMapCodes order",
    )
    .option('--env-path <path>', 'Engine environment file')
    .option('--mongo-host <host>', 'Mongo host override')
    .option('--dev', 'Use the development environment')
    .description("Record audio, upsert generic files and audio metadata, and configure a world's maps")
    .action(async (options) => {
      // Recording writes only `records/`: the client bundles no audio and fetches every asset
      // from engine-cyberia by code, so seeding the database is what makes a recording reachable.
      await prepareFallbackAudio({ recordsPath: options.recordsPath ?? DEFAULT_AUDIO_RECORDS_PATH });
      if (!options.recordsOnly) await runAudioCommand(undefined, { ...options, import: true, seedWorld: true });
      logger.info('seed-audio complete');
    });

  runner
    .command('import-default-items')
    .option('--dev', 'Force development environment (loads .env.development for IPFS localhost, etc.)')
    .option('--mongo-host <mongo-host>', 'Mongo host override, forwarded to every import')
    .option('--clean', 'Drop the Object Layers and the content collections instead; needs --confirm <deploy-id>')
    .option('--confirm <deploy-id>', 'Confirm --clean against this deploy id')
    .description('Import the default content: the saga, then the instance backups of every default world')
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

      const flags = `${options.dev ? ' --dev' : ''}${options.mongoHost ? ` --mongo-host ${options.mongoHost}` : ''}`;
      if (options.clean) {
        // Each drop checks the confirmation against its own deploy id.
        if (!options.confirm) {
          logger.error('--clean destroys data. Pass --confirm <deploy-id> to run it. It is never part of a deploy.');
          process.exit(1);
        }
        const confirm = ` --confirm ${options.confirm}`;
        shellExec(`node bin/cyberia ol --drop${confirm}${flags}`);
        shellExec(`node bin/cyberia run-workflow drop-db${confirm}${flags}`);
        return;
      }
      const sagaCode = 'amethyst-strata-expansion';
      shellExec(`node bin/cyberia generate-saga --import engine-private/cyberia-sagas/${sagaCode}.json${flags}`);
      for (const instanceCode of [sagaCode, 'FOREST', 'TEST'])
        shellExec(`node bin/cyberia instance ${instanceCode} --import${flags}`);
    });

  runner
    .command('stage-cli')
    .option('--output-path <output-path>', "Build context to stage the package in (default: '.')")
    .description('Packs this engine checkout as underpost-cli.tgz for a runtime image build context')
    .action((options) => stageCliPackage(options.outputPath || '.'));

  // Every file mirrored between this engine and a product checkout, engine path first. One
  // table for both directions, so a pair cannot be synced one way and forgotten the other.
  const cyberiaSrcSyncPairs = [
    ['./src/client/public/docs/cyberia/explanation/game-server.md', './cyberia-server/README.md'],
    ['./src/runtime/cyberia-server/Dockerfile', './cyberia-server/Dockerfile'],
    ['./src/runtime/cyberia-server/Dockerfile.dev', './cyberia-server/Dockerfile.dev'],
    ['./src/client/public/docs/cyberia/explanation/game-client.md', './cyberia-client/README.md'],
    ['./src/runtime/cyberia-client/Dockerfile', './cyberia-client/Dockerfile'],
    ['./src/runtime/cyberia-client/Dockerfile.dev', './cyberia-client/Dockerfile.dev'],
  ];

  runner
    .command('sync-src')
    .option('--from-repo', 'Copy from the product checkouts into this engine instead of out to them')
    .option('--dry-run', 'Report what would be copied without writing it')
    .description(
      'Mirrors the cyberia product READMEs and runtime Dockerfiles between this engine and the product checkouts',
    )
    .action((options) => {
      const fromRepo = options.fromRepo === true;
      const dryRun = options.dryRun === true;
      const copied = [];
      const missing = [];

      for (const [enginePath, repoPath] of cyberiaSrcSyncPairs) {
        const [source, target] = fromRepo ? [repoPath, enginePath] : [enginePath, repoPath];
        // A product checkout `setup-workspace` has not cloned yet must not leave the run
        // half applied, so a missing source is reported rather than thrown on.
        if (!fs.existsSync(source)) {
          missing.push(source);
          continue;
        }
        if (!dryRun) fs.copySync(source, target);
        copied.push(`${source} -> ${target}`);
      }

      logger.info(`Cyberia sources synced ${fromRepo ? 'from' : 'to'} the product checkouts`, {
        copied,
        missing,
        dryRun,
      });
    });

  runner
    .command('validate-domains')
    .option('--env <env>', 'Deploy environment; production also checks the cross-domain wiring', 'development')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.production')
    .description('Check API ownership, content partitions, views and client components of the dd-cyberia domains')
    .action((options = {}) => {
      const envPath = options.envPath || `./engine-private/conf/dd-cyberia/.env.${options.env}`;
      if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });
      const errors = validateDomainConf({
        confServer: loadConfServerJson('./engine-private/conf/dd-cyberia/conf.server.json', { resolve: true }),
        confClient: fs.readJsonSync('./engine-private/conf/dd-cyberia/conf.client.json'),
        env: options.env,
      });
      for (const error of errors) logger.error(error);
      if (errors.length) process.exit(1);
      logger.info(`dd-cyberia domain configuration is consistent (${options.env})`);
    });

  runner.command('setup-workspace').action(() => {
    shellExec(`node bin fs src/client/public/cyberia --tracked --pull --deploy-id dd-cyberia`);
    shellExec(`node bin/deploy.js cyberia`);
    if (!fs.existsSync('./cyberia-server')) shellExec(`${cli()} clone underpostnet/cyberia-server`);
    if (!fs.existsSync('./cyberia-client')) shellExec(`${cli()} clone underpostnet/cyberia-client`);
  });

  runner.command('e2e-build').action(() => {
    shellExec(`node bin/cyberia stat-contract`);
    shellExec(`node bin/cyberia run-workflow sync-src`);
    shellExec(`node bin run build-cluster-deployment-manifests`);
    shellExec(`node bin/cyberia run-workflow build-manifest`);
    shellExec(`node bin/cyberia run-workflow publish --dry-run`);
    shellExec(`npm run security`);
    shellExec(`sudo rm -rf ./underpost.config.dd*.js`);
  });

  runner.command('cluster').action(() => {
    shellExec(`node bin run cluster --runtime-image express --deploy-id dd-cyberia --instance-id mmo-server --dev`);
  });

  runner
    .command('dev-env')
    .option('--run', 'Run docker:reset, cluster --dev --reset, docker-image, and docker:up after updating compose.env')
    .option(
      '--clean',
      'Restore repositories to canonical state (git checkout Dockerfile, etc.) before updating compose.env',
    )
    .option('--test', 'Test DNS connectivity accross cyberia deployments')
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
      if (options.test) {
        const testHosts = [
          'localhost',
          'localhost:4005',
          'localhost:8081',
          'localhost:8082',
          'engine-cyberia',
          'cyberia-server',
          'cyberia-client',
        ];
        const testPaths = ['/', '/TEST', '/FOREST'];
        for (const host of testHosts) {
          for (const path of testPaths) {
            shellExec(`curl -L -v -i -s http://${host}${path} | head -n 10`, {
              silentOnError: true,
            });
          }
        }
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
    .option('--confirm <deploy-id>', 'Confirm the drop against this deploy id')
    .option('--release <release-id>', 'Drop the content of one release database instead of the workspace')
    .option('--include-runtime', 'Also drop player progress. Off by default: content resets never touch runtime state')
    .description(
      'Bootstrap only: drop the Cyberia content collections and the File documents they reference. Needs --confirm <deploy-id>; never part of a deploy',
    )
    .action(async (options = {}) => {
      const { deployId, host, path, db, releaseDatabase } = resolveDeployDb(options);
      assertDestructiveConfirmation(options, deployId, 'drop-db');

      logger.info('drop-db', { deployId, host, path, release: options.release || '', releaseDatabase });

      const cyberiaCollections = [
        'cyberia-entity',
        'cyberia-map',
        'cyberia-instance',
        'cyberia-instance-conf',
        'cyberia-dialogue',
        'cyberia-quest',
        'cyberia-action',
        'cyberia-skill',
        'cyberia-entity-type-default',
        'cyberia-client-hints',
        'cyberia-saga',
        'cyberia-audio',
        'cyberia-map-audio-conf',
        ...(options.includeRuntime ? ['cyberia-quest-progress'] : []),
      ];

      // Every File _id a Cyberia document owns: instance and map thumbnails and previews, and the
      // recorded WAV each audio asset points at. Read from the registry that maps a model to its
      // File fields, so a reference added there is dropped here without editing this command, and
      // read before anything is dropped, so no backing File survives the collection that held it.
      const fileReferences = cyberiaCollections
        .map((api) => ({ api, fields: fileRefFields(api) }))
        .filter(({ fields }) => fields.length > 0);

      await DataBaseProviderService.load({ apis: [...cyberiaCollections, 'file'], host, path, db });

      const File = DataBaseProviderService.getModel('file', { host, path });

      const fileIds = new Set();
      for (const { api, fields } of fileReferences) {
        const Model = DataBaseProviderService.getModel(api, { host, path });
        const docs = await Model.find(
          { $or: fields.map((field) => ({ [field]: { $ne: null } })) },
          Object.fromEntries(fields.map((field) => [field, 1])),
        ).lean();
        for (const doc of docs) {
          for (const field of fields) if (doc[field]) fileIds.add(doc[field].toString());
        }
      }

      // Content in a release database shares the File store with every other release, so its
      // Files cannot be proven unused here.
      const partitioned = !!db.partitions?.[CONTENT_PARTITION]?.name;
      if (partitioned) logger.info('Content Files are shared across releases; kept');
      else if (fileIds.size > 0) {
        const result = await File.deleteMany({ _id: { $in: [...fileIds] } });
        logger.info(`Removed ${result.deletedCount} referenced File document(s)`);
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

  runner.command('cp-assets').action(() => {
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
  });

  runner
    .command('sync-cluster')
    .option('--build')
    .action((options) => {
      shellExec(`node bin/build dd-cyberia --update-private`);
      shellExec(`node bin/build dd-core --update-private`);
      if (options.build) return;
      shellExec(
        `node bin wireguard --sync --repo-engine underpostnet/engine-test-cyberia --repo-engine-private underpostnet/engine-private`,
      );
    });

  runner
    .command('test')
    .option('--n-con <connections>', 'Number of concurrent WebSocket connections')
    .option('--duration <ms>', 'Load test duration in milliseconds')
    .option('--tap-freq <seconds>', 'Frequency of tap events in seconds')
    .action((options) => {
      shellExec(`CYBERIA_LOAD_WS_URL=ws://localhost:8081/ws \
CYBERIA_LOAD_CONNECTIONS=${options.nCon ?? 40} \
CYBERIA_LOAD_TAP_FREQUENCY=${options.tapFreq ?? 5} \
CYBERIA_LOAD_DURATION_MS=${options.duration ?? 1000 * 60 * 30} \
node bin test cyberia --grep 'Cyberia load'`);
    });

  runner
    .command('docker-image [id]')
    .option('--load-tar', 'Load a pre-built image tar archive into the enabled target(s) without building.')
    .action((id, options) => {
      // no funca
      if (options.loadTar) {
        for (const imageId of dockerImageIds)
          if (imageId === id || id === '.') shellExec(`docker load -i ./${imageId}-dev_v3.4.0.tar`);
        return;
      }
      switch (id) {
        case 'engine-cyberia':
          stageCliPackage(`./src/runtime/engine-cyberia`);
          shellExec(`
node bin/build dd-cyberia --conf
node bin/build dd-cyberia --update-private
node bin image --path src/runtime/engine-cyberia \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name engine-cyberia-dev:v3.4.0 \
  --image-out-path .
`);
          break;

        case 'cyberia-server':
          stageCliPackage(`./cyberia-server`);
          shellExec(`
cp -f src/runtime/cyberia-server/Dockerfile.dev cyberia-server/Dockerfile.dev
node bin image --path cyberia-server \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name cyberia-server-dev:v3.4.0 \
  --image-out-path .
`);
          break;
        case 'cyberia-client':
          stageCliPackage(`./cyberia-client`);
          shellExec(`
cp -f src/runtime/cyberia-client/Dockerfile.dev cyberia-client/Dockerfile.dev
node bin image --path cyberia-client \
  --docker-compose --pull-base --build \
  --dockerfile-name Dockerfile.dev \
  --image-name cyberia-client-dev:v3.4.0 \
  --image-out-path .
`);
          break;
      }
    });

  for (const [cmd, action] of Object.entries(cyberiaCatalog.packageScripts))
    runner.command(cmd).action(() => {
      if (cmd === 'docker:up' || cmd === 'docker:up:build' || cmd === 'docker:restart') {
        const { aliases, changed } = installCyberiaDockerHostAliases();
        logger.info(`Docker host aliases ${changed ? 'installed' : 'already configured'}`, { aliases });
      }
      shellExec(action);
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

      logger.info('seed-dialogues', { deployId, host, path });

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

      logger.info('seed-actions-quests', { deployId, host, path });

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

      logger.info('seed-skills', { deployId, host, path });

      await DataBaseProviderService.load({ apis: ['cyberia-skill'], host, path, db });

      const CyberiaSkill = DataBaseProviderService.getModel('cyberia-skill', { host, path });

      // Upsert each skill record keyed by triggerItemId — the full record (logic event keys +
      // expanded skills metadata). The collection is deployment-wide; an instance runs the
      // subset its own content triggers, decided at export and boot, never stored.
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
    .option(
      '--instance <instance-code>',
      "Point that instance's conf at the seeded documents, replacing whatever it referenced",
    )
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

      logger.info('seed-entities', { deployId, host, path });

      await DataBaseProviderService.load({
        apis: ['cyberia-entity-type-default', 'cyberia-instance-conf'],
        host,
        path,
        db,
      });

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
      const seededIds = [];
      for (const ed of ENTITY_TYPE_DEFAULTS) {
        const doc = await CyberiaEntityTypeDefault.findOneAndUpdate(
          { entityType: ed.entityType, liveItemIds: ed.liveItemIds || [] },
          {
            $set: {
              entityType: ed.entityType,
              liveItemIds: ed.liveItemIds || [],
              deadItemIds: ed.deadItemIds || [],
              dropItemIds: ed.dropItemIds || [],
              inventoryItemsIds: ed.inventoryItemsIds || [],
              overrideItemsIdsState: ed.overrideItemsIdsState || [],
              behavior: ed.behavior || '',
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
        if (doc?._id) seededIds.push(doc._id);
        upserted++;
      }

      logger.info(
        `seed-entities: ${upserted} entity-type-default records upserted`,
        ENTITY_TYPE_DEFAULTS.map((e) => `${e.entityType} → [${(e.liveItemIds || []).join(', ')}]`),
      );

      // A seeded document reaches a world only when that world's conf names it. Binding here is
      // what makes an edited row take effect, and it states the whole reference set so re-running
      // converges instead of accumulating.
      if (options.instance) {
        const CyberiaInstanceConf = DataBaseProviderService.getModel('cyberia-instance-conf', { host, path });
        const conf = await CyberiaInstanceConf.findOneAndUpdate(
          { instanceCode: options.instance },
          { $set: { entityDefaults: seededIds, updatedAt: new Date() } },
          { returnDocument: 'after' },
        );
        if (!conf) {
          logger.error(`cyberia-instance-conf not found for instanceCode="${options.instance}"`);
          process.exit(1);
        }
        logger.info(`seed-entities --instance ${options.instance}: ${seededIds.length} reference(s) bound`);
      }

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

  // Instance id → project root. Single source of truth for the workloads this
  // workflow builds: both the k8s manifests and the status page artifacts each
  // project ships are resolved from this list plus conf.instances.json.
  // The template instances this deploy builds artifacts for. Where each one publishes is not
  // listed here: instanceProjectPathFactory reads it off the conf entry, the same rule
  // instance-build-manifest applies, so the two can never name different checkouts.
  const CYBERIA_INSTANCE_IDS = ['mmo-client', 'mmo-server'];
  const CYBERIA_CONF_INSTANCES_PATH = './engine-private/conf/dd-cyberia/conf.instances.json';
  const CYBERIA_CONF_SSR_PATH = './engine-private/conf/dd-cyberia/conf.ssr.json';
  // Copy shared by the server and the client for a given status code. A status
  // without an entry falls back to its conf.ssr.json view title.
  const CYBERIA_STATUS_PAGE_META = {
    404: {
      title: 'Cyberia — Sector Not Found',
      description: 'Cyberia Online 404 — the requested sector is not on the grid.',
    },
  };

  /**
   * Reads the raw (unexpanded) conf.instances.json entries.
   * @returns {Array<object>} Instance entries, or an empty list when unavailable.
   */
  const readCyberiaConfInstances = () => {
    try {
      return JSON.parse(fs.readFileSync(CYBERIA_CONF_INSTANCES_PATH, 'utf8'));
    } catch (err) {
      logger.warn(`Could not read ${CYBERIA_CONF_INSTANCES_PATH}: ${err.message}`);
      return [];
    }
  };

  /**
   * Resolves the SSR view that renders a status page. The view is declared in
   * conf.ssr.json as a route whose path is the bare status code (`/404`), the
   * same declaration the PWA build turns into `/404/index.html`.
   * @param {string} status - HTTP status code.
   * @returns {{ client: string, title: string }|null} View descriptor, or null when undeclared.
   */
  const resolveStatusPageView = (status) => {
    if (!fs.existsSync(CYBERIA_CONF_SSR_PATH)) return null;
    const confSSR = JSON.parse(fs.readFileSync(CYBERIA_CONF_SSR_PATH, 'utf8'));
    for (const clientConf of Object.values(confSSR))
      for (const view of clientConf?.views || []) if (view.path === `/${status}`) return view;
    return null;
  };

  /**
   * Renders one custom status page to a static HTML artifact. The workloads no
   * longer serve error pages themselves — the document is carried into the
   * gateway config by `run instance-build-manifest`, so this only has to place
   * it at the `hostPath` the instance declares.
   * @param {string} status - HTTP status code.
   * @param {string} outputPath - Destination HTML path.
   * @param {boolean} [dev] - Render the development variant.
   * @returns {boolean} True when the artifact was rendered.
   */
  const buildCyberiaStatusPage = ({ status, outputPath, dev = false }) => {
    const view = resolveStatusPageView(status);
    const pagePath = `./src/client/ssr/views/${view?.client || `Cyberia${status}`}.js`;
    if (!fs.existsSync(pagePath)) {
      logger.warn(`[build-status-page] No SSR view for status ${status}; skipping`, { pagePath, outputPath });
      return false;
    }
    const meta = CYBERIA_STATUS_PAGE_META[status] || {};
    const title = meta.title || view?.title || `Cyberia — ${status}`;
    const description = meta.description || `Cyberia Online ${status}.`;
    shellExec(
      `node bin static --page ${pagePath}` +
        ` --output-path ${outputPath}` +
        ` --title '${title}'` +
        ` --favicon /favicon.ico` +
        ` --description '${description}'` +
        ` --lang en` +
        ` --env ${dev ? 'development' : 'production'}`,
    );
    return true;
  };

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
      // Collect the multiInstance variant codes of every game-server runtime
      // instance. They set the INSTANCE_CODES label in Dockerfile.dev, so the
      // dev image provisions each variant's backup dir and saga at build time.
      //
      // Only codes that have an on-disk instance backup directory are
      // included. The saga file is optional — the Dockerfile's for loop
      // already handles missing sagas gracefully (`if [ -f ... ]`).
      // A variant declared in conf.instances.json without the instance
      // directory is silently skipped so the Dockerfile never tries to
      // copy a non-existent directory and the container build does not fail.
      const cyberiaInstancesDir = '/home/dd/cyberia-instances';
      let instanceCodes = 'amethyst-strata-expansion,FOREST'; // fallback
      const confInstancesEntries = readCyberiaConfInstances();
      try {
        const serverInstances = confInstancesEntries.filter((inst) => inst.runtime === 'cyberia-server');
        const codes = new Set();
        for (const inst of serverInstances) {
          if (inst.multiInstance?.variants) {
            const topology = normalizeInstanceTopology(inst.multiInstance, `dd-cyberia/${inst.id}`);
            for (const v of topology.variants) {
              const code = v.path === '/' ? DEFAULT_INSTANCE_CODE : v.code;
              // Skip codes that have no on-disk instance backup dir
              const instanceDir = `${cyberiaInstancesDir}/instances/${code}`;
              if (!fs.existsSync(instanceDir)) {
                logger.info(`[build-manifest] Skipping code "${code}": no instance dir at ${instanceDir}`);
                continue;
              }
              codes.add(code);
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
        logger.warn(`[build-manifest] Could not read ${CYBERIA_CONF_INSTANCES_PATH}: ${err.message}; using fallback`);
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
      // The privateConfPaths array block sits between the /** INSTANCE_CODES */
      // markers. Replace its content with the resolved per-code paths.
      // syncPrivateConf copies each entry from `./engine-private/<path>`, so the
      // paths follow the local engine-private layout (`cyberia-instances/<code>`,
      // `cyberia-sagas/<code>.json`). Emit only paths that exist on disk, so the
      // sync never hits ENOENT for a variant without local content.
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

      // ── Build SSR views ──────────────────────────────────────────────────
      // Status pages are rendered BEFORE the manifests: the gateway manifests
      // embed each document declared under an instance's `customStatusPages`,
      // so the artifact has to exist at its `hostPath` by manifest time.
      const statusPagesBuilt = [];
      for (const id of CYBERIA_INSTANCE_IDS) {
        const instance = confInstancesEntries.find((entry) => entry.id === id);
        for (const page of instance?.customStatusPages || []) {
          if (!page?.status || !page?.hostPath) continue;
          const outputPath = nodePath.normalize(`${instanceProjectPathFactory(instance)}/${page.hostPath}`);
          if (buildCyberiaStatusPage({ status: page.status, outputPath, dev: isDev }))
            statusPagesBuilt.push({ instance: id, status: page.status, outputPath });
        }
      }
      logger.info('[build-manifest] Custom status pages built', statusPagesBuilt);
      shellExec(
        `node bin/cyberia run-workflow build-server-dashboard --output-path ./cyberia-server/public/index.html`,
      );

      // ── Build dev manifests (always --kind --dev) ────────────────────────
      {
        const flags = `--kind --dev${nodeFlag}`;
        for (const id of CYBERIA_INSTANCE_IDS)
          shellExec(`node bin run instance-build-manifest --deploy-id dd-cyberia --instance-id ${id} ${flags}`);
      }
      // ── Build prod manifests (--kubeadm, no --dev) ───────────────────────
      if (!isDev) {
        const flags = `--kubeadm${nodeFlag}`;
        for (const id of CYBERIA_INSTANCE_IDS)
          shellExec(`node bin run instance-build-manifest --deploy-id dd-cyberia --instance-id ${id} ${flags}`);
      }

      // Copy canonical doc sources into the generated project READMEs.
      // Edit the canonical sources; never hand-edit these generated outputs.
      // The mirrored deploy tree is generated, and rebuilt from scratch so a file
      // renamed upstream cannot linger. It keeps the engine layout, the
      // <deploy-id> directory beside lib/, because every deploy script sources
      // `$SCRIPT_DIR/../lib/logging.sh`.
      for (const project of ['cyberia-client', 'cyberia-server']) {
        const scripts = `./deploy/${project}`;
        // A tree assembled before these scripts were packaged does not carry them; mirroring is
        // what publishes them, so say so and continue rather than failing the whole manifest build.
        if (!fs.existsSync(scripts)) {
          logger.warn(`[build-manifest] No deploy scripts to mirror for ${project}`, { path: scripts });
          continue;
        }
        fs.removeSync(`./${project}/deploy`);
        fs.copySync('./deploy/lib', `./${project}/deploy/lib`);
        fs.copySync(scripts, `./${project}/deploy/${project}`);
      }
      fs.copyFileSync('./src/client/public/docs/cyberia/explanation/game-client.md', './cyberia-client/README.md');
      fs.copyFileSync('./src/client/public/docs/cyberia/explanation/game-server.md', './cyberia-server/README.md');
      fs.copyFileSync(
        './.github/workflows/cyberia-client.cd.yml',
        './cyberia-client/.github/workflows/cyberia-client.cd.yml',
      );
      fs.copyFileSync(
        './.github/workflows/cyberia-server.cd.yml',
        './cyberia-server/.github/workflows/cyberia-server.cd.yml',
      );
      shellExec('cp -a ./engine-private/conf/dd-cyberia/docker-compose/cyberia/. ./src/runtime/engine-cyberia/');
      // Scope the publish to the deployment this workflow builds: read
      // dd-cyberia's own environment, not the working-tree `./.env`.
      shellExec(
        `node bin/cyberia.js instance --publish-build --env-path ${deployEnvFilePath(
          'dd-cyberia',
          isDev ? 'development' : 'production',
        )}`,
      );
      logger.info(`run-workflow build-manifest complete (${isDev ? 'dev' : 'prod'})`);
    });

  runner
    .command('publish')
    .option('--dry-run', 'Dry run: show commands without executing them')
    .action((options) => {
      if (options.dryRun) {
        shellExec('node bin cmt --log --unpush cyberia-server');
        shellExec('node bin cmt --log --unpush cyberia-client');
        shellExec('node bin cmt --log --unpush cyberia-audio');
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
        shellExec('node bin push cyberia-audio underpostnet/cyberia-audio', {
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
          ` --title 'Metrics | CYBERIA MMO'` +
          ` --favicon /favicon.ico` +
          ` --description 'Operational dashboard for the cyberia-server MMO runtime.'` +
          ` --lang en` +
          ` --env ${options.dev ? 'development' : 'production'}`,
      );
    });

  runner
    .command('build-status-page')
    .requiredOption(
      '--status <status>',
      'HTTP status code to render (must be declared as an SSR view in conf.ssr.json).',
    )
    .option('--dev', 'Build a development variant of the status page.')
    .option(
      '--output-path <path>',
      'Output path for the rendered HTML. Defaults to the `hostPath` the mmo-server instance declares for the status.',
    )
    .description(
      'Build one custom status page artifact. The SSR view is resolved from the conf.ssr.json route whose path is ' +
        'the bare status code; the rendered document is served by the gateway, not by the workload.',
    )
    .action((options) => {
      const status = `${options.status}`;
      const statusPage = (
        readCyberiaConfInstances().find((entry) => entry.id === 'mmo-server')?.customStatusPages || []
      ).find((page) => `${page.status}` === status);
      const outputPath =
        options.outputPath || (statusPage ? nodePath.normalize(`./cyberia-server/${statusPage.hostPath}`) : null);
      if (!outputPath) {
        logger.error(`[build-status-page] No --output-path and no customStatusPages entry for status ${status}`);
        return;
      }
      buildCyberiaStatusPage({ status, outputPath, dev: !!options.dev });
    });

  runner
    .command('build-cyberia-404')
    .option('--dev', 'Build a development variant of the 404 page.')
    .option(
      '--output-path <path>',
      'Output path for the rendered 404.html (default: ./cyberia-server/public/404.html). ' +
        'The same page is served, sub-path aware, by the gateway for every instance variant of both the ' +
        'cyberia-server and cyberia-client workloads.',
    )
    .description(
      'Build the cyberpunk pixel-art "sector not found" (404) page shared by the Cyberia server + client. ' +
        'Thin alias of `build-status-page --status 404`, kept as the entrypoint the instance CI workflows call.',
    )
    .action((options) => {
      buildCyberiaStatusPage({
        status: '404',
        outputPath: options.outputPath || './cyberia-server/public/404.html',
        dev: !!options.dev,
      });
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
  // Reroute only on the passthrough sentinel. Every other error — a non-zero
  // subprocess, a CLI parse error, a missing module — must exit non-zero, so a
  // CI parent sees the failure.
  if (error && error.message === 'Trigger underpost passthrough') {
    // A redundant CLI name can only appear before the command; everything from the command
    // onward is an argument. Filtering the whole of argv removed those too, so an option whose
    // value happens to be `underpost` — a storage id, a public asset path — lost it, and the
    // parse failed on a missing argument rather than on anything the caller wrote.
    const commandIndex = process.argv.findIndex(
      (token, index) => index >= 2 && underpostProgram.commands.some((command) => command._name === token),
    );
    if (commandIndex > 2)
      process.argv = [
        ...process.argv.slice(0, 2),
        ...process.argv.slice(2, commandIndex).filter((token) => token !== 'underpost'),
        ...process.argv.slice(commandIndex),
      ];
    // Diagnostic output goes to stderr; stdout carries only what the rerouted command prints.
    if (!process.argv.includes('--plain')) process.stderr.write('Rerouting to underpost cli...\n');
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
