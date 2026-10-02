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
import { generateStatContract } from '../src/projects/cyberia/stat-contract-generator.js';
import { Command, InvalidArgumentError } from 'commander';
import fs from 'fs-extra';
import { shellArgumentFactory, shellExec, shellExecAsync } from '../src/server/runtime/process.js';
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
import { recordAudioBank, seedInstanceAudio } from '../src/projects/cyberia/seed-audio.js';
import { refreshMapPreviews } from '../src/projects/cyberia/map-preview-generator.js';
import {
  CyberiaMapAudioConfService,
  parseEventAudioBinding,
} from '../src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';
import { etcHostFactory, instanceProjectPathFactory, loadConfServerJson } from '../src/server/runtime/conf.js';
import {
  ObjectLayerEngine,
  resolveItemIdentity,
  pngDirectoryIteratorByObjectLayerType,
  writeFrameImage,
} from '../src/projects/cyberia/object-layer.js';
import {
  ITEM_DEFINITION_APIS,
  boundItemIds,
  catalogModels,
  reconcileItemCatalog,
  findBoundDefinition,
  findBoundDefinitions,
  reviseItemDefinition,
  seedItemCatalog,
} from '../src/projects/cyberia/object-layer-catalog.js';
import { pinContentReferences } from '../src/api/cyberia-item-catalog/item-ref.js';
import { objectLayerTokenId, ownershipRecord } from '../src/api/item-ledger/item-ledger.model.js';
import { sha256HexFromCid } from '../src/api/object-layer/object-layer.identity.js';
import { ItemLedgerIndexer } from '../src/api/item-ledger/item-ledger.indexer.js';
import { CyberiaObjectLayerProfile } from '../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { fetchInstanceObjectLayerItemIds, getInstanceModels } from '../src/projects/cyberia/instance-data.js';
import {
  releaseInstanceCodes,
  selectReleaseContent,
  withReleaseVariants,
} from '../src/projects/cyberia/release-content.js';
import { gatewayHostAliases } from '../src/projects/cyberia/compose-stack.js';
import {
  STACK_BUILDER_STAGE,
  STACK_IMAGE_IDS,
  STACK_WORKDIR,
  assertStackImages,
  assertStackSource,
  engineCloneArgs,
  localImage,
  localImageEnv,
  stackProbes,
  stageLocalEngineSource,
} from '../src/projects/cyberia/local-stack.js';
import {
  atlasFileIdsOf,
  exportObjectLayerBackup,
  fileBackup,
  fileFromBackup,
  restoreObjectLayerBackup,
} from '../src/projects/cyberia/instance-backup.js';
import { getKeyframeDirectionsByCode } from '../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { DEFAULT_ATLAS_UPSCALE_FACTOR } from '../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { AtlasSpriteSheetStore } from '../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { fileRefFields } from '../src/api/file/file.ref.js';
import {
  CONTENT_PARTITION,
  activateContentRelease,
  advanceContentRelease,
  beginContentRelease,
  contentReleaseRowFactory,
  failContentRelease,
  importArtifactContent,
  materializeWorkspace,
  promoteContentRelease,
  publishContentRelease,
  pruneContentReleases,
  releaseDbConf,
  reloadContentServers,
  retireContentRelease,
  rollbackContentRelease,
  servedContent,
  validateContentRelease,
} from '../src/projects/cyberia/content-release.js';
import { RELEASE_PROFILES, assertReleaseId, assertSourceChannel } from '../src/server/release/source-release.js';
import { RELEASE_STORE_ROOT, ReleaseWorkspace, fetchRevision } from '../src/server/release/release-workspace.js';
import {
  SOURCE_LOCK_FILE,
  lockedSource,
  readSourceLockFile,
  verifyLockedSource,
  writeSourceLockFile,
} from '../src/server/release/source-lock.js';
import { API_BASE_PATH } from '../src/server/domain/api-contract.js';
import { dropConsumerCanonicalPins, isObjectLayerAuthority } from '../src/api/object-layer/object-layer.publication.js';
import { purgeObjectLayers } from '../src/api/object-layer/object-layer.purge.js';
import * as cyberiaStudio from '../src/projects/cyberia/object-layer.extension.js';
import { consumedApisOf, ownsApi } from '../src/server/domain/consumed-api.js';
import { validateDomainConf } from '../src/projects/cyberia/domain-ownership.js';
import { ValkeyAPI, closeValkeyConnection, createValkeyConnection } from '../src/db/valkey/Valkey.js';
import { CacheService } from '../src/server/storage/cache.js';
import { program as underpostProgram } from '../src/cli/index.js';
import crypto from 'crypto';
import os from 'os';
import nodePath from 'path';
import Underpost from '../src/index.js';
import cyberiaCatalog from '../src/projects/cyberia/catalog-cyberia.js';
import {
  auditContent,
  contentArtifact,
  contentLockEntry,
  contentRoot,
  contentSources,
  deploymentRoot,
  entityTypeDefaultKey,
  importContent,
  importSaga,
  openContentArtifact,
  planContent,
  readBackupContent,
  readDatabaseContent,
  storeContentArtifact,
} from '../src/projects/cyberia/content-artifact.js';

import { ITEM_TYPES as itemTypes } from '../src/client/components/cyberia/SharedDefaultsCyberia.js';
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
 * Connects the Valkey of a deploy host, so the cache invalidations of a write reach the engine
 * that serves from that cache. Without it the engine caches serve their values until they expire.
 * @param {{host:string, path:string, valkey?:Object}} params - {@link resolveDeployDb} output.
 * @returns {Promise<void>}
 */
async function connectEngineCache({ host, path, valkey }) {
  if (!valkey) return;
  await createValkeyConnection({ host, path }, valkey);
  if (ValkeyAPI.isConnected({ host, path })) return;
  closeValkeyConnection({ host, path });
  logger.warn('Valkey is not reachable: the engine caches serve their values until they expire');
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
  const indexed = await materializations.ObjectLayerRenderFrames.migrateFormat();
  if (indexed > 0) logger.info(`Moved ${indexed} editor source(s) to indexed pixel frames`);
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

/** The product repositories whose checkouts the content and deployment roots name. */
const CONTENT_SOURCE = 'cyberia-content';
const DEPLOYMENT_SOURCE = 'cyberia-deployment';

/**
 * A product repository of the catalog.
 * @param {string} name
 * @returns {{name:string, repository:string, profile:string}}
 */
const releaseRepository = (name) => {
  const entry = cyberiaCatalog.releaseRepositories.find((repository) => repository.name === name);
  if (!entry) throw new Error(`${name} is not a product repository: see cyberia release list`);
  return entry;
};

/** The product repositories the deployment lock pins: every one but the deployment, which holds it. */
const lockedRepositories = () => cyberiaCatalog.releaseRepositories.filter(({ name }) => name !== DEPLOYMENT_SOURCE);

/**
 * The repository a checkout tracks, as `owner/repo`: its origin.
 * @param {string} dir
 * @returns {string}
 */
const checkoutRepository = (dir) =>
  Underpost.repo.repoSlugFactory(
    shellExec(`git -C ${dir} remote get-url origin`, { stdout: true, silent: true, disableLog: true }).trim(),
  );

/**
 * The absolute checkout of a product repository: the content and deployment roots, else the nested checkout.
 * @param {string} name - A `releaseRepositories` name.
 * @returns {string}
 */
const checkoutDir = (name) =>
  ({ [CONTENT_SOURCE]: contentRoot(), [DEPLOYMENT_SOURCE]: deploymentRoot() })[name] || nodePath.resolve(name);

/**
 * The commit a checkout stands at.
 * @param {string} dir
 * @returns {string}
 */
const headRevision = (dir) =>
  shellExec(`git -C ${dir} rev-parse HEAD`, { stdout: true, silent: true, disableLog: true }).trim();

const deploymentLockPath = (root = deploymentRoot()) => nodePath.join(root, SOURCE_LOCK_FILE);

/**
 * The lock of a deployment checkout, checked against the catalog: it pins each locked repository, under
 * the same repository, and nothing else.
 * @param {string} [root] - The deployment checkout; {@link deploymentRoot} by default.
 * @returns {{lockVersion:number, sources:Object<string,Object>}}
 */
const deploymentLock = (root) => {
  const file = deploymentLockPath(root);
  let lock;
  try {
    lock = readSourceLockFile(file);
  } catch (error) {
    throw new Error(`${error.message}: run cyberia release lock --commit, then cyberia release publish`);
  }
  const names = lockedRepositories()
    .map(({ name }) => name)
    .sort();
  const pinned = Object.keys(lock.sources);
  if (pinned.join() !== names.join())
    throw new Error(`${file} pins ${pinned.join(', ')}, not ${names.join(', ')}: run cyberia release lock`);
  for (const { name, repository } of lockedRepositories())
    if (lock.sources[name].repository !== repository)
      throw new Error(`${file} pins ${name} from ${lock.sources[name].repository}, not ${repository}`);
  return lock;
};

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

/** Resolves every name of the compose gateway to this host, in one identified /etc/hosts block. */
const installCyberiaDockerHostAliases = () => {
  const aliases = gatewayHostAliases('dd-cyberia');
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
      'Import specific item-id(s) passed as comma-separated command argument: from an instance backup with --instance (e.g. ol hatchet,sword --instance FOREST --import), else from the asset tree with --client-public',
    )
    .option(
      '--sync',
      'Bring stored object layers in line with the current profile, stats and schema, and derive their upscaled render and idle preview again; the render contract never changes (e.g. ol hatchet --sync, or ol --sync for all)',
    )
    .option(
      '--instance <instance-code>',
      'Limit --sync and --to-atlas-sprite-sheet to the object layers one instance runs on, or make --import restore item(s) from that instance backup under engine-private (e.g. ol hatchet --instance FOREST --import)',
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
      'Batch import by object layer type from the asset tree, needs --client-public (e.g. skin,floors or all)',
    )
    .option('--show-frame [direction-frame]', 'View object layer frame for given item-id e.g. 08_0 (default: 08_0)')
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--drop', 'Drop existing data before importing (needs --confirm <deploy-id>; never part of a deploy)')
    .option('--confirm <deploy-id>', 'Confirm a destructive action against this deploy id')
    .option('--release <release-id>', 'Work on the content release database of this id instead of the workspace')
    .option(
      '--client-public',
      'Keep src/client/public/cyberia/assets consistent with the operation: an import reads the asset tree (without --instance), every item an action writes has its frames and metadata written there from MongoDB, and --drop removes the folders of the dropped items',
    )
    .option('--dev', 'Force development environment (loads .env.development for IPFS localhost, etc.)')
    .action(
      /**
       * Main action handler for the `ol` command.
       * Manages object layer import, frame viewing, atlas generation, and atlas display.
       *
       * @param {string|undefined} itemId - Optional item ID argument.
       * @param {Object} options - Command options parsed by Commander.
       * @param {boolean} options.import - Import specific item-id(s) from the command argument (comma-separated).
       * @param {boolean} options.sync - Bring stored item(s) and their derived renders in line.
       * @param {string} options.instance - Instance code whose object layers --sync reprocesses.
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
       * @param {boolean} options.clientPublic - Keep the asset tree consistent with the operation.
       * @param {boolean} options.dev - Force development environment.
       * @returns {Promise<void>}
       * @memberof CyberiaCLI
       */
      async (
        itemId,
        options = {
          import: false,
          sync: false,
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
          dev: false,
        },
      ) => {
        const upscaleFactor = options.upscale ?? DEFAULT_ATLAS_UPSCALE_FACTOR;
        if (!Number.isInteger(upscaleFactor) || upscaleFactor < 1) {
          logger.error('--upscale takes a whole pixel factor of 1 or more');
          process.exit(1);
        }

        const { deployId, host, path, db, valkey, owns, releaseDatabase, workspaceDatabase } = resolveDeployDb(options);
        if (options.drop) assertDestructiveConfirmation(options, deployId, 'ol --drop');

        logger.info('env', {
          env: options.envPath,
          deployId,
          host,
          path,
          release: options.release || '',
        });

        const rebuildAtlases = ObjectLayerEngine.selectAtlasRebuild(options);
        const writes = Boolean(options.import || options.sync || options.importTypes || options.drop || rebuildAtlases);

        // Content that pins Object Layer references is migrated with the collection, so its
        // collections load for every flow. `--instance` reads the world the runtime reads. A write
        // draws the map previews again and reaches the game servers that serve its content.
        const contentApis = ['cyberia-quest', 'cyberia-action'];
        const instanceApis = options.instance
          ? ['cyberia-instance', 'cyberia-instance-conf', 'cyberia-map', 'cyberia-skill', 'cyberia-entity-type-default']
          : [];
        const writeApis = writes
          ? ['cyberia-map', 'cyberia-content-release', 'cyberia-server-registry'].filter(owns)
          : [];

        await DataBaseProviderService.load({
          apis: [
            ...new Set([
              ...ITEM_DEFINITION_APIS,
              ...(owns('item-ledger') ? ['item-ledger'] : []),
              ...contentApis,
              ...instanceApis,
              ...writeApis,
            ]),
          ],
          host,
          path,
          db,
        });

        /** @type {import('mongoose').Model} */
        const ObjectLayerRenderFrames = DataBaseProviderService.getModel('object-layer-render-frames', { host, path });
        /** @type {import('mongoose').Model} */
        const AtlasSpriteSheet = DataBaseProviderService.getModel('atlas-sprite-sheet', { host, path });

        // A model handle binds to one connection, and the health monitor replaces that
        // connection when it drops. A batch that runs for minutes therefore resolves its
        // models per item instead of holding the handles it started with.
        const models = () => catalogModels({ host, path });
        const contentModels = () => ({
          CyberiaQuest: DataBaseProviderService.getModel('cyberia-quest', { host, path }),
          CyberiaAction: DataBaseProviderService.getModel('cyberia-action', { host, path }),
        });

        /** With --client-public, the asset trees follow an item the action wrote: its stored frames and metadata. */
        const writeClientPublic = async (objectLayer) => {
          if (!options.clientPublic || !objectLayer) return;
          const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean();
          if (!stored) return;
          await ObjectLayerEngine.writeStaticFrameAssets({
            basePaths: ObjectLayerEngine.clientPublicPaths({ host, path }),
            itemType: objectLayer.data.item.type,
            itemId: objectLayer.data.item.id,
            objectLayerRenderFramesData: ObjectLayerRenderFrames.sourceOf(stored),
            objectLayerData: ObjectLayerEngine.payloadOf(objectLayer),
            cellPixelDim: upscaleFactor,
          });
        };

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

        if (options.instance && !options.sync && !rebuildAtlases && !options.import) {
          logger.warn('--instance only narrows --sync and --to-atlas-sprite-sheet, or sources --import, ignored');
        }

        /** The labels the flows below wrote; `all` once a flow wrote every label. */
        const touched = { itemIds: new Set(), all: false };

        if (writes) {
          // A write invalidates the engine caches it changes, so the running engine serves it at once.
          await connectEngineCache({ host, path, valkey });
          // Idempotent migration: every document carries its content identity and every label its
          // binding before a write lands. A read-only subcommand stays free of side effects.
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

          // Every definition that carries a dropped label goes, with its label binding, and with
          // --client-public its folder in the asset trees.
          const report = await purgeObjectLayers({
            options: { host, path, extension: cyberiaStudio },
            filter: isTargetedDrop ? { 'data.item.id': { $in: dropItemIds } } : {},
            pruneOrphans: true,
            assets: Boolean(options.clientPublic),
          });
          if (isTargetedDrop) for (const droppedItemId of dropItemIds) touched.itemIds.add(droppedItemId);
          else touched.all = true;

          logger.info(
            `Dropped: ${report.objectLayers} ObjectLayer, ${report.renderFrames} RenderFrames, ${report.atlases} AtlasSpriteSheet, ${report.files} File (atlas)`,
          );
          logger.info(
            `IPFS cleanup: ${report.unpinned} CIDs unpinned, ${report.pinRecords} pin record(s) dropped, ${report.mfsPaths} MFS path(s) removed`,
          );
          for (const { cid, itemId: keptItemId } of report.kept)
            logger.warn(`Kept ${cid} ("${keptItemId}"): registered in ItemLedger`);
        }

        // ── Handle --sync (stored item-id(s)) ────────────────────────────
        // Brings each definition in scope in line with the current profile, stats and schema, and
        // with --random-stats or --normalize-stats; only a changed definition is written. Then its
        // upscaled render and idle preview are derived again. The render contract never changes.
        if (options.sync) {
          const selectedItemIds = await selectScopedItemIds({
            itemId,
            instance: options.instance,
            host,
            path,
            action: '--sync',
          });

          logger.info(`Sync of ${selectedItemIds.length} stored item(s)`);
          const tally = { written: 0, updated: 0, unchanged: 0, missing: 0, failed: [] };

          // Isolated per item, for the same reason the render rebuild is.
          for (const currentItemId of selectedItemIds) {
            try {
              const { definition, written } = await reviseItemDefinition({
                models: models(),
                itemId: currentItemId,
                revise: (payload) => applyStatPolicy(payload, statPolicy),
                options: { host, path },
              });
              const { status } = await AtlasSpriteSheetStore.syncDerivedRenders({
                objectLayerCid: definition?.cid,
                options: { host, path },
              });
              await writeClientPublic(definition);
              touched.itemIds.add(currentItemId);
              if (written) tally.written++;
              tally[status]++;
              if (status === 'missing')
                logger.warn(`No render stored for '${currentItemId}'; build it with --to-atlas-sprite-sheet`);
              else
                logger.info(
                  `Synced '${currentItemId}': ${written ? 'definition written, ' : ''}derived renders ${status}`,
                );
            } catch (syncError) {
              logger.error(`Sync failed for '${currentItemId}': ${syncError.message}`);
              tally.failed.push(currentItemId);
            }
          }

          logger.info(
            `Sync done: ${tally.written} definition(s) written; derived renders ${tally.updated} updated, ` +
              `${tally.unchanged} unchanged, ${tally.missing} without a render; ${tally.failed.length} failed`,
          );
          if (tally.failed.length > 0) {
            logger.warn(`Rerun for the failed item(s): ${tally.failed.join(',')}`);
          }
        }

        // ── Handle --import --instance: restore item(s) from the instance backup ──
        // The backup in the content artifact is the authority for the item id: every document it
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
          const backupDir = contentArtifact().instanceDir(options.instance);
          logger.info(`Restoring ${itemIds.length} item(s) from instance backup '${options.instance}'`);
          let restored = 0;
          const replacements = new Map();
          for (const currentItemId of itemIds) {
            try {
              const summary = await restoreObjectLayerBackup({
                backupDir,
                itemId: currentItemId,
                options: { host, path },
                clientPublic: Boolean(options.clientPublic),
              });
              logger.info(`Restored '${currentItemId}' from backup`, summary);
              touched.itemIds.add(currentItemId);
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

        if (options.import && !options.instance && !options.clientPublic) {
          logger.error(
            '--import needs a source: --instance <code> for a backup, or --client-public for the asset tree',
          );
          process.exit(1);
        }
        if (options.importTypes && !options.clientPublic) {
          logger.error('--import-types reads the asset tree and needs --client-public');
          process.exit(1);
        }

        // ── Handle --import --client-public (specific item-id(s) from the asset tree) ──
        if (options.import && !options.instance) {
          const itemIds = parseItemIds(itemId);
          if (itemIds.length === 0) {
            logger.error(
              'item-id is required for --import --client-public (comma-separated item IDs, e.g. ol hatchet,sword --client-public --import)',
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

            const objectLayer = await ObjectLayerEngine.persistObjectLayerDocuments({
              models: models(),
              objectLayerRenderFramesData,
              objectLayerData,
              persistOptions: { upscaleFactor, options: { host, path } },
            });
            await writeClientPublic(objectLayer);
            touched.itemIds.add(currentItemId);

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
            await writeClientPublic(objectLayer);
            touched.itemIds.add(objectLayerId);

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
          const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean();
          if (!stored) {
            logger.error(`ObjectLayerRenderFrames not found for item: ${itemId}`);
            process.exit(1);
          }

          const objectLayerFrameDirections = getKeyframeDirectionsByCode(direction);
          if (objectLayerFrameDirections.length === 0) {
            logger.error(`Invalid direction code: ${direction}. Valid codes: 08, 18, 02, 12, 04, 14, 06, 16`);
            process.exit(1);
          }

          const objectLayerFrameDirection = objectLayerFrameDirections[0];
          const source = ObjectLayerRenderFrames.sourceOf(stored);
          const frames = source.frames[objectLayerFrameDirection];

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

          await writeFrameImage({
            source,
            pixels: frames[frameIndexNum],
            imagePath: outputPath,
            cellPixelDim: upscaleFactor,
          });

          logger.info(`Frame saved to: ${outputPath}`);
          shellExec(`firefox ${outputPath}`);
        }

        // ── Handle --to-atlas-sprite-sheet ───────────────────────────────
        // Rebuilds the render and publishes the definition that names it. The scope is the
        // same selection --sync uses: the given item-id(s), one instance, or the whole
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
              const rebuilt =
                objectLayer &&
                (await ObjectLayerEngine.rebuildItemRender({
                  models: models(),
                  objectLayer,
                  upscaleFactor,
                  maxAtlasDim,
                  revise: (payload) => applyStatPolicy(payload, statPolicy),
                  options: { host, path },
                }));
              if (!rebuilt) {
                logger.warn(`No render frames stored for '${currentItemId}', skipped`);
                tally.skipped++;
                continue;
              }

              const { metadata } = rebuilt.atlas;
              const frameCount = Object.values(metadata.frames).reduce((sum, frames) => sum + frames.length, 0);
              logger.info(
                `Atlas for '${currentItemId}': ${metadata.atlasWidth}x${metadata.atlasHeight} cells, ` +
                  `${frameCount} frames packed`,
              );
              await writeClientPublic(rebuilt.definition);
              touched.itemIds.add(currentItemId);
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

        // A write reaches what draws and serves the written labels: the map previews of this host,
        // then the game servers, when the runtime serves the content database the write went to.
        if (touched.all || touched.itemIds.size > 0) {
          if (owns('cyberia-map')) {
            const previews = await refreshMapPreviews({
              itemIds: touched.all ? null : [...touched.itemIds],
              options: { host, path },
            });
            logger.info(
              `Map previews: ${previews.drawn} drawn, ${previews.empty} without a picture, ${previews.failed.length} failed`,
            );
          }
          const served = owns('cyberia-content-release')
            ? (await servedContent({ host, path }, workspaceDatabase)).database
            : workspaceDatabase;
          if (served === (releaseDatabase || workspaceDatabase)) {
            const reached = await reloadContentServers({ host, path }, { mode: 'incremental' });
            logger.info(`Object layers reloaded on ${reached} game server(s)`);
          } else logger.info(`The runtime serves ${served}: the game servers see this write once it is promoted`);
        }

        closeValkeyConnection({ host, path });
        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
      },
    )
    .description('Object layer management');

  // ── instance: Cyberia instance backup / restore ─────────────────────────
  program
    .command('instance <instance-code>')
    .option(
      '--export [path]',
      'Export instance and related documents to a backup directory (default: the instance sources of the ' +
        'cyberia-content checkout)',
    )
    .option(
      '--import [path]',
      'Import instance and related documents from a backup directory (preserveUUID, upsert); ' +
        'the content artifact backup by default',
    )
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
      '--client-public',
      'With --import, also write the frames and metadata of each object layer to the asset tree; ' +
        'otherwise the frames stay in MongoDB only',
    )
    .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
    .option('--mongo-host <mongo-host>', 'Mongo host override')
    .option('--dev', 'Force development environment')
    .option(
      '--sync-entities',
      'Point the instance conf at every entity-type default its maps place and every skill their items trigger, dropping what the world no longer carries',
    )
    .description('Export/import a Cyberia instance with all related maps, entities and object layers')
    .action(async (instanceCode, options = {}) => {
      if (options.clientPublic && options.import === undefined) {
        logger.error('--client-public requires --import');
        process.exit(1);
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

      const { db, owns, releaseDatabase, valkey } = resolveDeployDb(options);
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

        // Only a content source checkout takes an export by default; a packed artifact never does.
        const backupDir =
          typeof options.export === 'string' && options.export
            ? options.export
            : nodePath.join(contentSources(), 'content', 'instances', instanceCode);

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
        //     actions reference. An item with no stored dialogue serves the flavor
        //     text of its content definition, so nothing is exported for it.
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
            : contentArtifact().instanceDir(instanceCode);

        if (!fs.existsSync(backupDir)) {
          logger.error(`Backup directory not found: ${backupDir}`);
          await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
          process.exit(1);
        }

        logger.info('Importing instance', { code: instanceCode, backupDir });
        // The engine serves a release database only once it is promoted, and a promotion reads fresh keys.
        if (!options.release) await connectEngineCache({ host, path, valkey });

        // A restore writes object layers, so every stored document carries its content identity
        // and every label its binding first.
        await runIdentityMigration(models, { CyberiaQuest, CyberiaAction }, { host, path });

        let restoredObjectLayers = 0;
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
              const report = await purgeObjectLayers({
                options: { host, path, extension: cyberiaStudio },
                filter: { 'data.item.id': { $in: [...dropOlItemIds] } },
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
          closeValkeyConnection({ host, path });
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

        // 2. Import object layers: each definition with its render frames, atlas, atlas Files and
        //    render payloads, from one restore shared with `ol --instance`.
        const olDir = `${backupDir}/object-layers`;
        if (fs.existsSync(olDir)) {
          let staticFiles = 0;
          let rebuilt = 0;
          for (const file of fs.readdirSync(olDir).filter((f) => f.endsWith('.json'))) {
            const olItemId = nodePath.basename(file, '.json');
            try {
              const restored = await restoreObjectLayerBackup({
                backupDir,
                itemId: olItemId,
                options: { host, path },
                clientPublic: !!options.clientPublic,
              });
              restoredObjectLayers++;
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
            `Imported ${restoredObjectLayers} ObjectLayer document(s) (${rebuilt} render(s) rebuilt), ${staticFiles} static frame PNG(s)`,
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
        //     the conf's references keep resolving after a restore. A backup document replaces
        //     each one of its entity type and live items that no other instance conf references:
        //     the foundation or a saga made it. Another world's document stays.
        const entityDefaultsDir = `${backupDir}/cyberia-entity-type-defaults`;
        if (fs.existsSync(entityDefaultsDir)) {
          const entityDefaultFiles = fs.readdirSync(entityDefaultsDir).filter((f) => f.endsWith('.json'));
          const otherWorlds = new Set(
            (await CyberiaInstanceConf.find({ instanceCode: { $ne: instanceCode } }, { entityDefaults: 1 }).lean())
              .flatMap(({ entityDefaults }) => entityDefaults || [])
              .map((id) => String(id?._id ?? id)),
          );
          let entityDefaultCount = 0;
          let replacedCount = 0;
          for (const file of entityDefaultFiles) {
            const edData = fs.readJsonSync(`${entityDefaultsDir}/${file}`);
            if (!edData.entityType || !edData._id) {
              logger.warn(`Skipping CyberiaEntityTypeDefault backup without entityType or _id: ${file}`);
              continue;
            }
            const replaced = (await CyberiaEntityTypeDefault.find(entityTypeDefaultKey(edData), { _id: 1 }).lean())
              .map(({ _id }) => String(_id))
              .filter((id) => id !== String(edData._id) && !otherWorlds.has(id));
            await CyberiaEntityTypeDefault.deleteMany({ _id: { $in: [edData._id, ...replaced] } });
            await CyberiaEntityTypeDefault.create(edData);
            entityDefaultCount++;
            replacedCount += replaced.length;
          }
          logger.info(`Imported ${entityDefaultCount} CyberiaEntityTypeDefault document(s)`, {
            ...(replacedCount > 0 ? { replaced: replacedCount } : {}),
          });
        }

        // A conf can reference a default this backup does not carry — an older backup, or one
        // exported before the reference existed. Restoring that reference would recreate the
        // orphan the export just removed, so the restored conf is compacted too.
        await CyberiaEntityTypeDefaultService.compactInstanceRefs({ host, path }, { instanceCode });

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

            const report = await purgeObjectLayers({
              options: { host, path, extension: cyberiaStudio },
              filter: { 'data.item.id': { $in: [...dropOlItemIds] } },
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

      closeValkeyConnection({ host, path });
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
        const result = await seedInstanceAudio(
          { instanceCode: options.instance, recordsPath: options.recordsPath },
          { host, path },
        );
        logger.info(
          `seed-audio --instance ${options.instance}: ${result.assets.length} assets, ${result.maps.length} maps`,
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
  // The data release of cyberia-content. The host prepares a read-only workspace at the locked
  // revision; a Release Job builds it with the repository's own commands, ingests it into its own
  // database and validates it. Promotion switches the pointer. Nothing drops a served database.
  const contentRelease = program
    .command('content-release')
    .description('Versioned Cyberia content: prepare, build and validate a release, promote, roll back, prune');

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
    'cyberia-skill',
    'cyberia-instance',
    'cyberia-instance-conf',
  ];

  const releaseEnvOptions = (command) =>
    command
      .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
      .option('--mongo-host <mongo-host>', 'Mongo host override')
      .option('--dev', 'Force development environment');

  const storeOption = (command) =>
    command.option('--store <path>', `The release store (default: ${RELEASE_STORE_ROOT})`, RELEASE_STORE_ROOT);

  /** Opens the release ledger (runtime database) and, when a release is named, that release's content. */
  const openReleases = async (options, releaseId = '') => {
    const context = resolveDeployDb({ ...options, release: releaseId });
    await DataBaseProviderService.load({ apis: RELEASE_APIS, host: context.host, path: context.path, db: context.db });
    const provider = DataBaseProviderService.getProvider({ host: context.host, path: context.path }, 'mongoose');
    // A reconnect replaces the connection and the models of the provider.
    return {
      ...context,
      provider,
      get models() {
        return provider.models;
      },
      get connection() {
        return provider.connection;
      },
    };
  };

  const printChecks = (validation) => {
    for (const entry of validation.checks) {
      const line = `${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name} (${entry.count})`;
      if (entry.ok) logger.info(line);
      else logger.error(line);
      for (const message of entry.findings) (entry.ok ? logger.info : logger.error)(`      ${message}`);
    }
  };

  /** The database of the release a context names, through the driver: its artifact has no model. */
  const releaseStore = (context) => context.connection.getClient().db(context.releaseDatabase);

  /** Stores the content artifact of a root in the release database: an engine that serves the release reads it there. */
  const storeReleaseArtifact = async (context, root) => {
    const stored = await storeContentArtifact(releaseStore(context), openContentArtifact(root));
    logger.info(`Stored ${stored} content artifact file(s) in ${context.releaseDatabase}`);
  };

  /** Validates the content the models read, after publishing its definitions when asked. */
  const runValidation = async (context, { publish = false } = {}) => {
    const { models, host, path, consumes, release } = context;
    const artifact = release
      ? {
          db: releaseStore(context),
          digest:
            (await models.CyberiaContentRelease.findOne({ releaseId: release }, { content: 1 }).lean())?.content
              ?.digest ?? '',
        }
      : undefined;
    const publication = publish ? await publishContentRelease(models, { options: { host, path, consumes } }) : null;
    const validation = await validateContentRelease(models, { options: { host, path, consumes }, artifact });
    if (publication) {
      validation.checks.unshift(publication);
      validation.ok = validation.ok && publication.ok;
      logger.info(`Published ${publication.created} new definition(s) to the Object Layer authority`);
    }
    printChecks(validation);
    return validation;
  };

  /** Records a validation report on a release. */
  const recordValidation = async (models, releaseId, validation) => {
    const { manifest, dependencies, ...report } = validation;
    await models.CyberiaContentRelease.updateOne(
      { releaseId },
      { $set: { validation: report, manifest, dependencies } },
    );
  };

  const codeList = (value) =>
    `${value ?? ''}`
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);

  /**
   * Runs one `cyberia` command line of an artifact import in a child process that reads the artifact
   * of `root`, with the database options of this command. The event loop keeps running meanwhile.
   * @param {string} root - The content root.
   * @param {Object} options - `envPath`, `mongoHost` and `dev`.
   * @returns {(args:string)=>Promise<void>}
   */
  const artifactImportRunner = (root, options) => {
    const passthrough = [
      options.envPath ? `--env-path ${options.envPath}` : '',
      options.mongoHost ? `--mongo-host ${options.mongoHost}` : '',
      options.dev ? '--dev' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (args) =>
      shellExecAsync(`${process.execPath} ${process.argv[1]} ${args} ${passthrough}`, {
        env: { ...process.env, CYBERIA_CONTENT_ROOT: root },
      });
  };

  /** The source checkouts the deploy resolved: the engine root and each product repository beside it. */
  const resolvedSources = () =>
    [
      { name: 'engine', dir: '.' },
      ...cyberiaCatalog.releaseRepositories.map(({ name }) => ({ name, dir: checkoutDir(name) })),
    ]
      .filter(({ dir }) => fs.existsSync(`${dir}/.git`))
      .map(({ name, dir }) => ({
        name,
        repository: checkoutRepository(dir),
        sourceRevision: headRevision(dir),
      }));

  /** Builds the content repository at its exact revision with its own commands, and no Secret in their environment. */
  const runContentContract = async (sourceDir, buildDir) => {
    shellExec(
      `cp -a ${shellArgumentFactory(sourceDir)} ${shellArgumentFactory(buildDir)} && chmod -R u+w ${shellArgumentFactory(buildDir)}`,
    );
    const result = await shellExecAsync('npm ci && npm test && npm pack', {
      cwd: buildDir,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' },
      silentOnError: true,
    });
    if (result.code !== 0) throw new Error(`npm ci, npm test and npm pack exited with ${result.code}`);
  };

  /**
   * Builds one release through its lifecycle: `building` while its content is built, verified and
   * ingested; `candidate` once its database holds it; `validated` or `failed` at the stage that stopped it.
   */
  const buildRelease = async (context, releaseId, { fields, build }) => {
    const Model = context.models.CyberiaContentRelease;
    const begun = await beginContentRelease(Model, {
      releaseId,
      holder: process.env.HOSTNAME || os.hostname(),
      fields: {
        ...fields,
        database: context.releaseDatabase,
        provenance: {
          engineVersion: JSON.parse(fs.readFileSync('./package.json', 'utf8')).version,
          engineCommit: shellExec('git rev-parse --short HEAD', {
            stdout: true,
            silent: true,
            silentOnError: true,
          }).trim(),
          job: process.env.HOSTNAME || '',
          builtAt: new Date(),
          builtBy: os.userInfo().username,
        },
      },
      reset: async (database) => context.connection.useDb(database, { useCache: true }).dropDatabase(),
    });
    if (begun.skipped) return begun.release;
    let stage = 'build';
    try {
      await build((name) => (stage = name));
      await advanceContentRelease(Model, releaseId, 'candidate');
      stage = 'validate';
      const validation = await runValidation(context, { publish: true });
      await recordValidation(context.models, releaseId, validation);
      if (!validation.ok)
        throw new Error(
          `failed checks: ${validation.checks
            .filter((entry) => !entry.ok)
            .map((entry) => entry.name)
            .join(', ')}`,
        );
      return await advanceContentRelease(Model, releaseId, 'validated');
    } catch (error) {
      await failContentRelease(Model, releaseId, stage, error);
      throw new Error(`Release ${releaseId} failed at ${stage}: ${error.message}`);
    }
  };

  /** Promotes when asked: always with `--promote`, with `--bootstrap` only while no release is active. */
  const promoteWhenAsked = async (context, releaseId, options) => {
    const Model = context.models.CyberiaContentRelease;
    if (options.promote || (options.bootstrap && !(await Model.active()))) {
      const { active, retired } = await promoteContentRelease(Model, releaseId);
      logger.info(`Active release: ${active.releaseId}${retired ? `; rollback target: ${retired.releaseId}` : ''}`);
    }
  };

  /** Ends a content-release command: the provider closes and the exit code says whether it succeeded. */
  const endRelease = async (context, ok) => {
    await context.provider.close();
    process.exit(ok ? 0 : 1);
  };

  storeOption(
    contentRelease
      .command('prepare <release-id>')
      .requiredOption(
        '--channel <channel>',
        'The source channel the locked revision is fetched from: public or private',
      )
      .description(
        `On the host: fetch the content revision the deployment ${SOURCE_LOCK_FILE} pins into a read-only release workspace`,
      ),
  ).action((releaseId, options = {}) => {
    try {
      const { repository, revision, artifact } = lockedSource(deploymentLock(), CONTENT_SOURCE);
      if (!artifact) throw new Error(`${deploymentLockPath()} pins no ${CONTENT_SOURCE} artifact`);
      const sourceRepository = Underpost.repo.sourceRepoFactory(repository, assertSourceChannel(options.channel));
      const workspace = ReleaseWorkspace.materialize({
        root: options.store,
        releaseId,
        record: {
          repository,
          sourceRevision: revision,
          version: artifact.version,
          digest: artifact.digest,
          channel: options.channel,
          sourceRepository,
          sources: resolvedSources(),
        },
        remote: Underpost.repo.gitAuthFactory(sourceRepository),
      });
      logger.info(`Release ${releaseId} prepared at ${workspace.dir}`, { sourceRepository, revision });
      process.exit(0);
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

  storeOption(
    releaseEnvOptions(
      contentRelease
        .command('build <release-id>')
        .option(
          '--from <source>',
          'source (the prepared workspace), backups (the local content artifact) or workspace (what the portal authored)',
          'backups',
        )
        .option('--instances <codes>', 'Comma-separated instance codes (default: every instance the release serves)')
        .option('--promote', 'Promote the release once it is validated')
        .option('--bootstrap', 'Promote the release once it is validated, only while no release is active')
        .description('Build a release into its own database, then validate it'),
    ),
  ).action(async (releaseId, options = {}) => {
    const id = assertReleaseId(releaseId);
    if (!['source', 'backups', 'workspace'].includes(options.from)) {
      logger.error(`--from takes source, backups or workspace, not "${options.from}"`);
      process.exit(1);
    }
    const context = await openReleases(options, id);
    const instances = releaseInstanceCodes(codeList(options.instances));
    try {
      let release;
      if (options.from === 'source') {
        const workspace = new ReleaseWorkspace({ root: options.store, releaseId: id });
        const record = workspace.record();
        const buildDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), `content-release-${id}-`));
        try {
          release = await buildRelease(context, id, {
            fields: {
              instances,
              source: {
                from: 'source',
                channel: record.channel,
                repository: record.repository,
                sourceRevision: record.sourceRevision,
              },
              sources: record.sources,
              content: { version: record.version, digest: record.digest },
            },
            build: async (stage) => {
              stage('contract');
              workspace.verify();
              await runContentContract(workspace.sourceDir, `${buildDir}/source`);
              stage('verify');
              const built = openContentArtifact(`${buildDir}/source`).manifest;
              if (built.contentDigest !== record.digest || built.sourceRevision !== record.sourceRevision)
                throw new Error(
                  `built ${built.contentDigest} at ${built.sourceRevision}; the lock names ${record.digest} at ${record.sourceRevision}`,
                );
              stage('artifact');
              await storeReleaseArtifact(context, `${buildDir}/source`);
              stage('ingest');
              await importArtifactContent({
                run: artifactImportRunner(`${buildDir}/source`, options),
                ...selectReleaseContent({ manifest: built, instances }),
                releaseId: id,
              });
            },
          });
        } finally {
          fs.removeSync(buildDir);
        }
      } else if (options.from === 'backups') {
        const { manifest } = contentArtifact();
        release = await buildRelease(context, id, {
          fields: {
            instances,
            source: { from: 'backups' },
            content: { version: manifest.contentVersion, digest: manifest.contentDigest },
          },
          build: async (stage) => {
            stage('artifact');
            await storeReleaseArtifact(context, contentRoot());
            stage('ingest');
            await importArtifactContent({
              run: artifactImportRunner(contentRoot(), options),
              ...selectReleaseContent({ manifest, instances }),
              releaseId: id,
            });
          },
        });
      } else {
        // The workspace holds what the content artifact on disk imported: the release carries that artifact.
        const { manifest } = openContentArtifact(contentRoot());
        release = await buildRelease(context, id, {
          fields: {
            source: { from: 'workspace' },
            content: { version: manifest.contentVersion, digest: manifest.contentDigest },
          },
          build: async (stage) => {
            stage('artifact');
            await storeReleaseArtifact(context, contentRoot());
            stage('ingest');
            const copied = await materializeWorkspace({
              connection: context.connection,
              workspace: context.workspaceDatabase,
              database: context.releaseDatabase,
              apis: context.db.partitions[CONTENT_PARTITION].apis,
            });
            logger.info('Copied the workspace', copied);
            const codes = (await context.models.CyberiaInstance.find({}, { code: 1 }).lean()).map((doc) => doc.code);
            await context.models.CyberiaContentRelease.updateOne({ releaseId: id }, { $set: { instances: codes } });
          },
        });
      }
      logger.info(`Release ${id} is ${release.status}`);
      await promoteWhenAsked(context, id, options);
      await endRelease(context, true);
    } catch (error) {
      logger.error(error.message);
      await endRelease(context, false);
    }
  });

  releaseEnvOptions(
    contentRelease
      .command('validate [release-id]')
      .description('Run every check on a release and record the report; on the workspace when no release is named'),
  ).action(async (releaseId, options = {}) => {
    const id = releaseId ? assertReleaseId(releaseId) : '';
    const context = await openReleases(options, id);
    if (id && !(await context.models.CyberiaContentRelease.exists({ releaseId: id }))) {
      logger.error(`Release ${id} does not exist`);
      await endRelease(context, false);
    }
    const validation = await runValidation(context);
    if (id) await recordValidation(context.models, id, validation);
    logger.info(`${id ? `Release ${id}` : 'The workspace'} is ${validation.ok ? 'valid' : 'invalid'}`);
    await endRelease(context, validation.ok);
  });

  releaseEnvOptions(
    contentRelease
      .command('retire')
      .description('Stop serving the active release: the runtime serves the workspace, and rollback re-promotes it'),
  ).action(async (options = {}) => {
    const context = await openReleases(options);
    const retired = await retireContentRelease(context.models.CyberiaContentRelease);
    const base = context.db.partitions?.[CONTENT_PARTITION]?.name ?? '';
    logger.info(`Retired release: ${retired.releaseId}; the runtime serves ${base}`);
    await context.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('promote <release-id>')
      .description('Serve a validated release. Running engines rebind and reload the game servers'),
  ).action(async (releaseId, options = {}) => {
    const context = await openReleases(options);
    const { active, retired } = await promoteContentRelease(context.models.CyberiaContentRelease, releaseId);
    logger.info(
      `Active release: ${active.releaseId} (${active.database})${retired ? `; rollback target: ${retired.releaseId}` : ''}`,
    );
    await context.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('rollback')
      .option('--from <release-id>', 'Roll back only while this release is the active one')
      .description('Serve the release that was active before the current one'),
  ).action(async (options = {}) => {
    const context = await openReleases(options);
    const result = await rollbackContentRelease(context.models.CyberiaContentRelease, { from: options.from });
    if (!result) logger.info(`Release ${options.from} is not active; nothing to roll back`);
    else
      logger.info(
        `Active release: ${result.active.releaseId} (${result.active.database})${
          result.retired ? `; retired: ${result.retired.releaseId}` : ''
        }`,
      );
    await context.provider.close();
  });

  releaseEnvOptions(
    contentRelease.command('status').description('The active release and what this ledger holds'),
  ).action(async (options = {}) => {
    const context = await openReleases(options);
    const active = await context.models.CyberiaContentRelease.active();
    const base = context.db.partitions?.[CONTENT_PARTITION]?.name ?? '';
    logger.info(
      active
        ? `Active release: ${active.releaseId} (${active.database})`
        : `No release promoted; the runtime serves ${base}`,
    );
    // Ledger rows are data, so they go to stdout plainly, never through the logger.
    for (const entry of await context.models.CyberiaContentRelease.find({}).sort({ createdAt: -1 }).lean())
      console.log(contentReleaseRowFactory(entry));
    await context.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('prune')
      .option('--keep <n>', 'Releases to keep beyond the protected ones, newest first', parseInt, 2)
      .description(
        'Drop old releases: their databases and ledger entries. Never a building, validated or active release, or the rollback target',
      ),
  ).action(async (options = {}) => {
    const context = await openReleases(options);
    const removed = await pruneContentReleases({
      CyberiaContentRelease: context.models.CyberiaContentRelease,
      connection: context.connection,
      context: { host: context.host, path: context.path },
      baseDatabase: context.db.partitions?.[CONTENT_PARTITION]?.name ?? '',
      keep: options.keep,
    });
    logger.info(removed.length ? `Pruned: ${removed.join(', ')}` : 'Nothing to prune');
    await context.provider.close();
  });

  releaseEnvOptions(
    contentRelease
      .command('activate')
      .description('Bind this process to the active release (what a running engine does on start and on promotion)'),
  ).action(async (options = {}) => {
    const context = await openReleases(options);
    const result = await activateContentRelease({ host: context.host, path: context.path });
    logger.info(
      result ? `Serving ${result.releaseId || '(base)'} from ${result.database}` : 'No content partition on this host',
    );
    await context.provider.close();
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

  // ─── Content artifact ───────────────────────────────────────────────────────
  // The content artifact is the only content source. These commands show its identity, audit
  // serialized content against it, and import it.
  const content = program.command('content').description('The Cyberia content artifact: status, audit and import');

  const CONTENT_APIS = [
    'cyberia-skill',
    'cyberia-entity-type-default',
    'cyberia-map',
    'cyberia-action',
    'cyberia-quest',
    'cyberia-dialogue',
    'cyberia-saga',
    'cyberia-instance',
    'cyberia-instance-conf',
    ...ITEM_DEFINITION_APIS,
  ];

  /** Opens the content models of the deploy host. */
  const openContent = async (options) => {
    const { host, path, db, valkey } = resolveDeployDb(options);
    await DataBaseProviderService.load({ apis: CONTENT_APIS, host, path, db });
    return { host, path, valkey, provider: DataBaseProviderService.getProvider({ host, path }, 'mongoose') };
  };

  content
    .command('status')
    .description('Show the identity of the installed content artifact')
    .action(() => {
      const { manifest } = contentArtifact();
      logger.info('Content artifact', {
        repository: manifest.repository,
        version: manifest.contentVersion,
        sourceRevision: manifest.sourceRevision,
        digest: manifest.contentDigest,
        schemaVersion: manifest.schemaVersion,
        instances: manifest.instances,
        sagas: manifest.sagas,
      });
      process.exit(0);
    });

  const printAudit = (report) => {
    logger.info(`Audit of ${report.source}`, report.inspected);
    for (const status of ['in-sync', 'differs', 'absent']) {
      const entries = report.foundation.filter((entry) => entry.status === status);
      if (entries.length === 0) continue;
      logger.info(
        `  foundation ${status} (${entries.length}): ${entries
          .map((entry) => (entry.fields.length ? `${entry.itemId} [${entry.fields.join(', ')}]` : entry.itemId))
          .join(', ')}`,
      );
    }
    if (report.generated.length > 0)
      logger.info(
        `  generated (${report.generated.length}): ${report.generated.map(({ itemId, saga }) => `${itemId} (${saga})`).join(', ')}`,
      );
    if (report.unresolved.length > 0)
      logger.warn(
        `  unresolved (${report.unresolved.length}): ${report.unresolved
          .map(({ itemId, stored }) => (stored ? itemId : `${itemId} (named only)`))
          .join(', ')}`,
      );
    if (report.skills.length > 0)
      logger.info(
        `  skills: ${report.skills.map(({ triggerItemId, status }) => `${triggerItemId} ${status}`).join(', ')}`,
      );
  };

  /** The content an audit or an export reads: the named backups, or the database. */
  const readContentSources = async (options) => {
    if (options.backup) return options.backup.split(',').map((dir) => readBackupContent(dir.trim()));
    const { provider } = await openContent(options);
    const database = await readDatabaseContent(provider.models);
    await provider.close();
    return [database];
  };

  releaseEnvOptions(
    content
      .command('audit')
      .option('--backup <dirs>', 'Comma-separated instance backup directories to audit instead of the database')
      .description('Classify every label content names or stores, and plan each artifact label against its definition'),
  ).action(async (options = {}) => {
    for (const source of await readContentSources(options)) printAudit(auditContent({ content: source }));
    process.exit(0);
  });

  /** Logs a content plan: Object Layer labels, then each family by status. */
  const printPlan = ({ objectLayers, documents }, rebind) => {
    const counts = (entries) =>
      ['absent', 'in-sync', 'differs']
        .map((status) => [status, entries.filter((entry) => entry.status === status).length])
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status} ${count}`)
        .join(', ');
    logger.info(`object layers: ${counts(objectLayers) || 'none'}`);
    for (const entry of objectLayers.filter(({ status }) => status === 'differs'))
      logger.info(`  ${entry.itemId} differs in ${entry.fields.join(', ')}${rebind ? '' : ' — kept'}`);
    for (const [family, entries] of Object.entries(documents))
      logger.info(
        `${family}: ${counts(entries) || 'none'}${!rebind && entries.some(({ status }) => status === 'differs') ? ' — differing kept' : ''}`,
      );
  };

  releaseEnvOptions(
    content
      .command('import')
      .option('--saga <code>', 'Import this saga of the artifact instead of the foundation')
      .option('--release <release-id>', 'Import into the content release database of this id instead of the workspace')
      .option('--rebind', 'Move differing labels and documents to the artifact; render and placement stay')
      .option('--dry-run', 'Plan only; write nothing')
      .description(
        'Import the content artifact: Object Layer definitions and their catalog bindings, entity-type ' +
          'defaults, skills, maps, quests, dialogues and actions of the foundation, or of one saga. Idempotent',
      ),
  ).action(async (options = {}) => {
    const artifact = contentArtifact();
    const saga = options.saga ? artifact.saga(options.saga) : null;
    const families = saga ? saga.families : artifact.foundation;
    const rebind = !!options.rebind;
    const { host, path, valkey, provider } = await openContent(options);
    const { models } = provider;
    if (options.dryRun) printPlan(await planContent({ families, models }), rebind);
    else {
      // The engine serves a release database only once it is promoted, and a promotion reads fresh keys.
      if (!options.release) await connectEngineCache({ host, path, valkey });
      // A write stores definitions, so the collection migrates first.
      await runIdentityMigration(
        catalogModels({ host, path }),
        { CyberiaQuest: models.CyberiaQuest, CyberiaAction: models.CyberiaAction },
        { host, path },
      );
      const context = { host, path };
      const result = saga
        ? await importSaga({ saga, models, context, rebind })
        : await importContent({ families, models, context, rebind });
      printPlan(result.plan, rebind);
      logger.info(
        `Imported ${saga ? `saga ${options.saga}` : 'the foundation'}: ${result.objectLayers} object layer ` +
          `definition(s); ${Object.entries(result.written)
            .map(([family, count]) => `${count} ${family}`)
            .join(', ')} written`,
      );
    }
    await provider.close();
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
      "Configure that instance's maps, in its own cyberiaMapCodes order (required unless --records-only)",
    )
    .option('--env-path <path>', 'Engine environment file')
    .option('--mongo-host <host>', 'Mongo host override')
    .option('--dev', 'Use the development environment')
    .description("Record audio, upsert generic files and audio metadata, and configure a world's maps")
    .action(async (options) => {
      if (!options.recordsOnly && !options.instance) {
        logger.error('--instance <instance-code> is required unless --records-only');
        process.exit(1);
      }
      // Recording writes only `records/`: the client bundles no audio and fetches every asset
      // from engine-cyberia by code, so seeding the database is what makes a recording reachable.
      await recordAudioBank({ recordsPath: options.recordsPath ?? DEFAULT_AUDIO_RECORDS_PATH });
      if (!options.recordsOnly) await runAudioCommand(undefined, { ...options, import: true, seedWorld: true });
      logger.info('seed-audio complete');
    });

  runner
    .command('import-content')
    .option('--dev', 'Force development environment (loads .env.development for IPFS localhost, etc.)')
    .option('--mongo-host <mongo-host>', 'Mongo host override, forwarded to every import')
    .option('--clean', 'Drop the Object Layers and the content collections instead; needs --confirm <deploy-id>')
    .option('--confirm <deploy-id>', 'Confirm --clean against this deploy id')
    .description(
      'Import the release content of the artifact: its foundation, the release sagas, then the release instances',
    )
    .action(async (options) => {
      if (options.clean) {
        const flags = `${options.dev ? ' --dev' : ''}${options.mongoHost ? ` --mongo-host ${options.mongoHost}` : ''}`;
        // Each drop checks the confirmation against its own deploy id.
        if (!options.confirm) {
          logger.error('--clean destroys data. Pass --confirm <deploy-id> to run it. It is never part of a deploy.');
          process.exit(1);
        }
        // Both cleanup steps run even if one fails.
        const confirm = ` --confirm ${options.confirm}`;
        const failed = [`run-workflow drop-db${confirm}${flags}`, `ol --drop${confirm}${flags}`].filter(
          (step) => shellExec(`node bin/cyberia ${step}`, { silentOnError: true }).code !== 0,
        );
        if (failed.length > 0) {
          for (const step of failed) logger.error(`Clean step failed; rerun: node bin/cyberia ${step}`);
          process.exit(1);
        }
        return;
      }
      const { manifest } = contentArtifact();
      await importArtifactContent({
        run: artifactImportRunner(contentRoot(), options),
        ...selectReleaseContent({ manifest }),
      });
    });

  runner
    .command('stage-cli')
    .option('--output-path <output-path>', "Build context to stage the package in (default: '.')")
    .description('Packs this engine checkout as underpost-cli.tgz for a runtime image build context')
    .action((options) => stageCliPackage(options.outputPath || '.'));

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

  runner.command('cluster').action(() => {
    shellExec(`node bin run cluster --runtime-image express --deploy-id dd-cyberia --instance-id mmo-server --dev`);
  });

  /** The release builds whose output a stack image takes when it builds from this workspace. */
  const STACK_IMAGE_BUILDS = {
    'engine-cyberia': [CONTENT_SOURCE, DEPLOYMENT_SOURCE],
    'cyberia-server': ['cyberia-server'],
    'cyberia-client': ['cyberia-client'],
  };

  /**
   * A fresh checkout of a product repository of a source channel, at one revision, in the stack work directory.
   * @param {string} name - A product repository.
   * @param {string} channel
   * @param {string} revision - A commit, or `HEAD` for the branch tip.
   * @returns {string} The checkout.
   */
  const fetchChannelCheckout = (name, channel, revision) => {
    const dir = nodePath.join(STACK_WORKDIR, 'sources', name);
    fs.removeSync(dir);
    fs.mkdirpSync(dir);
    const repository = Underpost.repo.sourceRepoFactory(releaseRepository(name).repository, channel);
    fetchRevision(dir, Underpost.repo.gitAuthFactory(`https://github.com/${repository}.git`), revision);
    return dir;
  };

  /**
   * The build context and build args of one stack image. The engine image clones its sources in its
   * own build, or takes them staged from this workspace; a game image builds a checkout: this
   * workspace's, or a clone at the revision the lock pins.
   * @param {string} id - A stack image.
   * @param {{source:string, channel:string, lock?:Object}} params
   * @returns {{context:string, buildArgs?:Object<string,string>}}
   */
  const stackImageContext = (id, { source, channel, lock }) => {
    if (id === 'engine-cyberia') {
      const context = nodePath.join(STACK_WORKDIR, id);
      fs.removeSync(context);
      // A clone build leaves source/ empty; the context holds it in every mode.
      fs.mkdirpSync(nodePath.join(context, 'source'));
      fs.copyFileSync('./src/runtime/engine-cyberia/Dockerfile.dev', nodePath.join(context, 'Dockerfile.dev'));
      if (source === 'local') {
        stageLocalEngineSource({
          context,
          engineRoot: '.',
          deploymentRoot: deploymentRoot(),
          contentRoot: contentRoot(),
        });
        return { context, buildArgs: { CYBERIA_SOURCE: 'local' } };
      }
      return {
        context,
        buildArgs: engineCloneArgs({
          channel,
          deploymentRepository: releaseRepository(DEPLOYMENT_SOURCE).repository,
          contentRepository: releaseRepository(CONTENT_SOURCE).repository,
        }),
      };
    }
    if (source === 'local') return { context: checkoutDir(id) };
    return { context: fetchChannelCheckout(id, channel, lock.sources[id].revision) };
  };

  /** Removes the untagged images of podman and Docker: what a newer build or load replaced. */
  const pruneSupersededImages = () => {
    shellExec('sudo podman image prune -f');
    shellExec('sudo docker image prune -f');
  };

  /**
   * Builds the dev images of the stack from one source and loads them into Docker. A local build runs
   * the release builds its images take first; a clone build reads the lock of the channel's deployment.
   * Each image leaves on the host only its Docker copy and the tagged builder stage, its build cache.
   * @param {{ids:string[], source:string, channel:string}} params
   */
  const buildStackImages = ({ ids, source, channel }) => {
    pruneSupersededImages();
    if (source === 'local') {
      const builds = Object.keys(RELEASE_BUILDS).filter((name) =>
        ids.some((id) => STACK_IMAGE_BUILDS[id].includes(name)),
      );
      shellExec(`node bin/cyberia release build ${builds.join(' ')} --dev`);
    }
    const lock =
      source === 'clone' && ids.some((id) => id !== 'engine-cyberia')
        ? deploymentLock(fetchChannelCheckout(DEPLOYMENT_SOURCE, channel, 'HEAD'))
        : null;
    const cliPackage = stageCliPackage(STACK_WORKDIR);
    const archives = nodePath.join(STACK_WORKDIR, 'images');
    Underpost.image.pullBaseImages();
    for (const id of ids) {
      const { context, buildArgs } = stackImageContext(id, { source, channel, lock });
      fs.copyFileSync(cliPackage, nodePath.join(context, STAGED_CLI_PACKAGE));
      const image = localImage(id);
      const build = {
        path: context,
        dockerfileName: 'Dockerfile.dev',
        buildArgs,
        buildSecrets: source === 'clone' ? { github_token: process.env.GITHUB_TOKEN } : {},
      };
      Underpost.image.build({ ...build, imageName: image.builder, target: STACK_BUILDER_STAGE });
      Underpost.image.build({ ...build, imageName: image.name, imageOutPath: archives, dockerCompose: true });
      // Docker holds the image the stack runs: the podman copy and the archive are leftovers.
      shellExec(`sudo podman rmi ${shellArgumentFactory(`${image.repository}:${image.tag}`)}`);
      fs.removeSync(archives);
      pruneSupersededImages();
    }
  };

  /**
   * Requests every probe of the running stack through the gateway names.
   * @returns {Promise<boolean>} Whether every probe answered below 400.
   */
  const probeStack = async () => {
    const results = await Promise.all(
      stackProbes().map(async ({ name, url }) => {
        try {
          const { status } = await fetch(url, { signal: AbortSignal.timeout(10000) });
          return { name, url, status, ok: status < 400 };
        } catch (error) {
          return { name, url, status: error.cause?.code || error.name, ok: false };
        }
      }),
    );
    for (const { name, url, status, ok } of results) logger[ok ? 'info' : 'error'](`${name}: ${status} ${url}`);
    return results.every(({ ok }) => ok);
  };

  runner
    .command('dev-env [images...]')
    .option(
      '--source <source>',
      'local: the working trees of this workspace; clone: the repositories of --channel',
      'local',
    )
    .option('--channel <channel>', 'The source channel a clone fetches from: public or private', 'private')
    .option('--no-build', 'Run the stack on the dev images already loaded')
    .option('--reset', 'Only tear the stack down: its containers, network and volumes')
    .option('--test', 'Only probe the gateway routes of the running stack')
    .description(
      `Reset the Docker stack, build its dev images (${STACK_IMAGE_IDS.join(', ')}; default: all) from one source, ` +
        'then run the stack on them. Nothing is committed or published',
    )
    .action(async (images = [], options = {}) => {
      try {
        if (options.reset) {
          shellExec(cyberiaCatalog.packageScripts['docker:reset']);
          return;
        }
        if (options.test) {
          if (!(await probeStack())) process.exit(1);
          return;
        }
        const ids = assertStackImages(images);
        const source = assertStackSource(options.source);
        const channel = assertSourceChannel(options.channel);
        shellExec(cyberiaCatalog.packageScripts['docker:reset']);
        if (options.build) buildStackImages({ ids, source, channel });
        const { aliases, changed } = installCyberiaDockerHostAliases();
        logger.info(`Docker host aliases ${changed ? 'installed' : 'already configured'}`, { aliases });
        shellExec(cyberiaCatalog.packageScripts['docker:up'], { env: { ...process.env, ...localImageEnv() } });
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
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

  runner.command('deploy [id]').action((id) => {
    if (!STACK_IMAGE_IDS.includes(id)) {
      logger.error(`Invalid deploy id: ${id}. Must be one of: ${STACK_IMAGE_IDS.join(', ')}`);
      process.exit(1);
    }
    shellExec(`gh workflow run ${id}.cd.yml -R underpostnet/${id} -f job=deploy`);
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

  for (const [cmd, action] of Object.entries(cyberiaCatalog.packageScripts))
    runner.command(cmd).action(() => {
      if (cmd === 'docker:up' || cmd === 'docker:up:build' || cmd === 'docker:restart') {
        const { aliases, changed } = installCyberiaDockerHostAliases();
        logger.info(`Docker host aliases ${changed ? 'installed' : 'already configured'}`, { aliases });
      }
      shellExec(action);
    });

  // The instance families `release build` sets the release variants of and writes manifests and status
  // pages for. instanceProjectPathFactory reads the checkout each one publishes to off its conf entry.
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
   * @param {string} outputPath - Destination HTML path, `<site root>/<status>/index.html` as an SSR view.
   * @param {string} application - The application the build manifest of the page names.
   * @param {boolean} [dev] - Render the development variant.
   * @returns {boolean} True when the artifact was rendered.
   */
  const buildCyberiaStatusPage = ({ status, outputPath, application, dev = false }) => {
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
        ` --site-root ${nodePath.dirname(nodePath.dirname(outputPath))}` +
        ` --application ${application}` +
        ` --title '${title}'` +
        ` --favicon /favicon.ico` +
        ` --description '${description}'` +
        ` --lang en` +
        ` --env ${dev ? 'development' : 'production'}`,
    );
    return true;
  };

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
          ` --application cyberia-server` +
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
      'Output path for the rendered HTML, `<site root>/<status>/index.html`. Defaults to the `hostPath` the mmo-server instance declares for the status.',
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
      buildCyberiaStatusPage({ status, outputPath, application: 'cyberia-server', dev: !!options.dev });
    });

  runner
    .command('build-cyberia-404')
    .option('--dev', 'Build a development variant of the 404 page.')
    .option(
      '--output-path <path>',
      'Output path for the rendered 404 page (default: ./cyberia-server/public/404/index.html). ' +
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
        outputPath: options.outputPath || './cyberia-server/public/404/index.html',
        application: 'cyberia-server',
        dev: !!options.dev,
      });
    });

  /** Writes the release instances into conf.instances.json: every game instance family serves their paths. */
  const writeReleaseVariants = () => {
    const confInstances = withReleaseVariants(readCyberiaConfInstances(), CYBERIA_INSTANCE_IDS);
    fs.writeFileSync(CYBERIA_CONF_INSTANCES_PATH, `${JSON.stringify(confInstances, null, 2)}\n`, 'utf8');
  };

  /**
   * Writes what a game checkout carries from this engine: its status pages, its instance manifests, the
   * deploy scripts in the engine layout, and the mirrored files.
   * @param {string} name - `cyberia-server` or `cyberia-client`.
   * @param {{dev?:boolean, nodeName?:string}} options
   */
  const buildGameCheckout = (name, options) => {
    const dir = checkoutDir(name);
    const conf = readCyberiaConfInstances();
    const instances = CYBERIA_INSTANCE_IDS.map((id) => {
      const instance = conf.find((entry) => entry.id === id);
      if (!instance) throw new Error(`${CYBERIA_CONF_INSTANCES_PATH} declares no ${id}`);
      return instance;
    }).filter((instance) => nodePath.resolve(instanceProjectPathFactory(instance)) === dir);
    // The gateway manifests embed each status page, so the pages come first.
    for (const instance of instances)
      for (const page of instance.customStatusPages || [])
        if (page?.status && page?.hostPath)
          buildCyberiaStatusPage({
            status: page.status,
            outputPath: nodePath.join(dir, page.hostPath),
            application: name,
            dev: options.dev,
          });
    const nodeFlag = options.nodeName ? ` --node-name ${options.nodeName}` : '';
    for (const flags of options.dev ? ['--kind --dev'] : ['--kind --dev', '--kubeadm'])
      for (const { id } of instances)
        shellExec(
          `node bin run instance-build-manifest --deploy-id dd-cyberia --instance-id ${id} ${flags}${nodeFlag}`,
        );
    fs.removeSync(`${dir}/deploy`);
    fs.copySync('./deploy/lib', `${dir}/deploy/lib`);
    fs.copySync(`./deploy/${name}`, `${dir}/deploy/${name}`);
    const docs = { 'cyberia-server': 'game-server.md', 'cyberia-client': 'game-client.md' };
    fs.copyFileSync(`./src/client/public/docs/cyberia/explanation/${docs[name]}`, `${dir}/README.md`);
    for (const dockerfile of ['Dockerfile', 'Dockerfile.dev'])
      fs.copyFileSync(`./src/runtime/${name}/${dockerfile}`, `${dir}/${dockerfile}`);
    fs.copyFileSync(`./.github/workflows/${name}.cd.yml`, `${dir}/.github/workflows/${name}.cd.yml`);
  };

  /**
   * Writes the deployment checkout: the dd-cyberia conf and package manifest, the runtime images and the
   * manifests. Each of the three trees is rebuilt whole, so nothing the topology no longer declares stays.
   */
  const buildDeploymentCheckout = async () => {
    const deployment = deploymentRoot();
    if (!fs.existsSync(deployment))
      Underpost.repo.syncCheckout({ path: deployment, repo: releaseRepository(DEPLOYMENT_SOURCE).repository });
    for (const tree of ['conf', 'images', 'manifests']) fs.removeSync(`${deployment}/${tree}`);
    shellExec('node bin run build-cluster-deployment-manifests');
    shellExec('sudo rm -rf ./underpost.config.dd*.js');
    shellExec(cyberiaCatalog.packageScripts['docker:generate']);
    shellExec('cp -a ./engine-private/conf/dd-cyberia/docker-compose/cyberia/. ./src/runtime/engine-cyberia/');
    const conf = `${deployment}/conf/dd-cyberia`;
    fs.mkdirpSync(conf);
    for (const file of [
      'conf.server.json',
      'conf.client.json',
      'conf.cron.json',
      'conf.ssr.json',
      'conf.volume.json',
      'conf.instances.json',
    ])
      fs.copyFileSync(`./engine-private/conf/dd-cyberia/${file}`, `${conf}/${file}`);
    // The deploy's package manifest under the product identity, from the builder of every generated manifest.
    fs.writeFileSync(
      `${conf}/package.json`,
      `${JSON.stringify(
        buildDeployPackageJson({
          deployId: 'dd-cyberia',
          enginePackageJson: fs.readJsonSync('./package.json'),
          catalog: await loadDeployCatalog('dd-cyberia'),
          currentPackageJson: fs.readJsonSync(deployPackagePathFactory('dd-cyberia')),
          productIdentity: true,
        }),
        null,
        DEPLOY_MANIFEST_INDENT,
      )}\n`,
    );
    for (const env of ['production', 'development', 'test'])
      fs.copyFileSync('./engine-private/conf/dd-cyberia/docker-compose/cyberia/compose.env', `${conf}/.env.${env}`);
    // The staged CLI package is a build-context artifact, never deployment state.
    fs.copySync('./src/runtime/engine-cyberia', `${deployment}/images/engine-cyberia`, {
      filter: (src) => nodePath.basename(src) !== STAGED_CLI_PACKAGE,
    });
    fs.copySync('./manifests/deployment/dd-cyberia-development/.', `${deployment}/images/engine-cyberia/.`);
    for (const [name, id] of [
      ['cyberia-client', 'mmo-client'],
      ['cyberia-server', 'mmo-server'],
    ]) {
      fs.copySync(`./src/runtime/${name}`, `${deployment}/images/${name}`);
      fs.copySync(
        `./engine-private/conf/dd-cyberia/instances/${id}/build/development/.`,
        `${deployment}/images/${name}/.`,
      );
    }
    fs.copySync(`${checkoutDir('cyberia-server')}/manifests`, `${deployment}/manifests`);
    fs.copySync(`${checkoutDir('cyberia-client')}/manifests`, `${deployment}/manifests`);
    fs.copySync(
      './manifests/deployment/dd-cyberia-development',
      `${deployment}/manifests/deployments/dd-cyberia-development`,
    );
  };

  const GAME_BUILD_MESSAGE = 'Update build and deployment manifests';

  /**
   * The build of each product repository, in build order: the deployment copies the game manifests. A
   * build with a commit message writes tracked files; the content build writes only its ignored artifact.
   */
  const RELEASE_BUILDS = {
    'cyberia-server': {
      build: (options) => {
        buildGameCheckout('cyberia-server', options);
        shellExec(
          `node bin/cyberia run-workflow build-server-dashboard --output-path ${checkoutDir('cyberia-server')}/public/index.html`,
        );
      },
      message: () => GAME_BUILD_MESSAGE,
    },
    'cyberia-client': {
      build: (options) => buildGameCheckout('cyberia-client', options),
      message: () => GAME_BUILD_MESSAGE,
    },
    [CONTENT_SOURCE]: {
      build: () => shellExec(`cd ${contentRoot()} && node bin/cyberia-content.js pack`),
    },
    [DEPLOYMENT_SOURCE]: {
      build: buildDeploymentCheckout,
      message: (options) =>
        shellExec(`node bin cmt --changelog-msg --from-n-commit ${options.fromNCommit} --changelog-no-hash`, {
          stdout: true,
          silent: true,
        }).trim() || 'Update deployment',
    },
  };

  /**
   * Commits the changes of a checkout under a path, when there are any.
   * @param {string} dir
   * @param {string} message
   * @param {string} [path='.']
   */
  const commitCheckout = (dir, message, path = '.') => {
    Underpost.repo.declareSafeDirectory(dir);
    if (
      !shellExec(`git -C ${dir} status --porcelain -- ${path}`, { stdout: true, silent: true, disableLog: true }).trim()
    )
      return;
    shellExec(`git -C ${dir} add -- ${path} && git -C ${dir} commit -q -m ${shellArgumentFactory(message)} -- ${path}`);
    logger.info(`Committed ${dir}: ${message.split('\n')[0]}`);
  };

  /**
   * Pushes a checkout to a repository, then tracks that repository as origin.
   * @param {{dir:string, target:string}} checkout
   * @param {boolean} [force] - Push with `-f`, which can rewrite the history of the repository.
   * @returns {boolean} False when the push fails; the origin then stays.
   */
  const publishCheckout = ({ dir, target }, force = false) => {
    Underpost.repo.declareSafeDirectory(dir);
    if (shellExec(`node bin push ${dir} ${target}${force ? ' -f' : ''}`, { silentOnError: true }).code !== 0) {
      logger.error(`${dir} not pushed to ${target}: its origin stays`);
      return false;
    }
    Underpost.repo.setOrigin({ path: dir, repository: target });
    return true;
  };

  const release = program
    .command('release')
    .option('-f, --force', 'Force the operation: publish pushes with -f')
    .description(`The product repositories: profiles, builds, the deployment ${SOURCE_LOCK_FILE} and publication`);

  release
    .command('list')
    .option('--profile <profile>', `Only one profile: ${Object.keys(RELEASE_PROFILES).join(', ')}`)
    .option(
      '--locked',
      `Only the repositories the deployment ${SOURCE_LOCK_FILE} pins, with the revision as a fourth field`,
    )
    .description('Print `<name> <repository> <profile>` for each product repository')
    .action((options = {}) => {
      try {
        const lock = options.locked ? deploymentLock() : null;
        for (const { name, repository, profile } of lock ? lockedRepositories() : cyberiaCatalog.releaseRepositories) {
          if (!RELEASE_PROFILES[profile]) throw new Error(`${name}: unknown release profile "${profile}"`);
          if (options.profile && options.profile !== profile) continue;
          console.log(`${name} ${repository} ${profile}${lock ? ` ${lock.sources[name].revision}` : ''}`);
        }
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  release
    .command('build [names...]')
    .option('--dev', 'Write only the development manifests of the game checkouts')
    .option(
      '--node-name <node-name>',
      'The node the hostPath volumes of the game manifests bind to (default: UNDERPOST_DEPLOY_NODE, then this host)',
    )
    .option('--commit', 'Commit what each build writes to the game and deployment checkouts')
    .option('--from-n-commit <n>', 'The engine commits the deployment commit message sums up', '1')
    .description(
      'Set the release instances in conf.instances.json, then build the named product repositories. ' +
        'With no names: the shared runtime contract, every repository, then the secret scan',
    )
    .action(async (names = [], options = {}) => {
      try {
        for (const name of names)
          if (!RELEASE_BUILDS[name]) throw new Error(`${releaseRepository(name).name} has nothing to build`);
        writeReleaseVariants();
        if (!names.length) logger.info('Runtime contract', await generateStatContract());
        for (const [name, { build, message }] of Object.entries(RELEASE_BUILDS)) {
          if (names.length && !names.includes(name)) continue;
          await build(options);
          if (options.commit && message) commitCheckout(checkoutDir(name), message(options));
        }
        if (!names.length) shellExec('npm run security:secrets:ci');
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  release
    .command('lock')
    .option('--commit', `Commit ${SOURCE_LOCK_FILE} in the deployment checkout`)
    .description(
      `Pin the committed revision of each product repository, and the content artifact, in the deployment ${SOURCE_LOCK_FILE}`,
    )
    .action((options = {}) => {
      try {
        const sources = {};
        for (const { name, repository } of lockedRepositories()) {
          const dir = checkoutDir(name);
          if (!fs.existsSync(`${dir}/.git`)) throw new Error(`${dir} is not a checkout of ${repository}`);
          if (shellExec(`git -C ${dir} status --porcelain`, { stdout: true, silent: true, disableLog: true }).trim())
            throw new Error(`${dir} has uncommitted changes: commit them before a lock`);
          sources[name] = { repository, revision: headRevision(dir) };
        }
        const content = contentLockEntry(contentArtifact().manifest);
        const checkout = sources[CONTENT_SOURCE];
        if (content.repository !== checkout.repository || content.revision !== checkout.revision)
          throw new Error(
            `The content artifact is ${content.repository} at ${content.revision}, not ${checkout.revision}: build ${CONTENT_SOURCE} first`,
          );
        sources[CONTENT_SOURCE] = content;
        const lock = writeSourceLockFile(deploymentLockPath(), sources);
        logger.info(
          `Locked ${deploymentLockPath()}`,
          Object.fromEntries(Object.entries(lock.sources).map(([name, { revision }]) => [name, revision])),
        );
        if (options.commit) commitCheckout(deploymentRoot(), 'Lock the deployment sources', SOURCE_LOCK_FILE);
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  release
    .command('verify')
    .description(`Check that the installed content artifact is the one the deployment ${SOURCE_LOCK_FILE} pins`)
    .action(() => {
      try {
        verifyLockedSource(deploymentLock(), CONTENT_SOURCE, contentLockEntry(contentArtifact().manifest));
        logger.info(`The content artifact is the one ${deploymentLockPath()} pins`);
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  release
    .command('publish [names...]')
    .option(
      '--private',
      'Push each checkout to its private mirror (<repository>-private) instead of the public repository',
    )
    .option('--dry-run', 'Track each target repository as origin and list the commits it lacks; push nothing')
    .description(
      'Push the named product checkouts (default: all of them) to the repository of their source channel, and ' +
        'track it as origin. The deployment goes last, once every other named checkout is pushed',
    )
    .action((names = [], options = {}, command) => {
      const { force } = command.optsWithGlobals();
      try {
        for (const name of names) releaseRepository(name);
      } catch (error) {
        logger.error(error.message);
        process.exit(1);
      }
      const channel = options.private ? 'private' : 'public';
      const checkouts = [...lockedRepositories(), releaseRepository(DEPLOYMENT_SOURCE)]
        .filter(({ name }) => !names.length || names.includes(name))
        .map(({ name, repository }) => ({
          name,
          dir: checkoutDir(name),
          target: Underpost.repo.sourceRepoFactory(repository, channel),
        }));
      if (options.dryRun) {
        for (const { dir, target } of checkouts) {
          logger.info(`${dir} → ${target}${force ? ' (force)' : ''}`);
          Underpost.repo.declareSafeDirectory(dir);
          Underpost.repo.setOrigin({ path: dir, repository: target });
          shellExec(`node bin cmt --log --unpush ${dir}`);
        }
        return;
      }
      const failed = [];
      for (const checkout of checkouts) {
        if (checkout.name === DEPLOYMENT_SOURCE && failed.length) {
          logger.error(`${checkout.dir} not pushed: its lock pins ${failed.join(', ')}`);
          failed.push(checkout.dir);
        } else if (!publishCheckout(checkout, force)) failed.push(checkout.dir);
      }
      if (failed.length) process.exit(1);
    });

  release
    .command('clean [names...]')
    .description(
      'Discard every change not committed in the named checkouts a build writes (default: all of them); commits stay',
    )
    .action((names = []) => {
      const written = Object.keys(RELEASE_BUILDS).filter((name) => RELEASE_BUILDS[name].message);
      const unknown = names.filter((name) => !written.includes(name));
      if (unknown.length) {
        logger.error(`A build writes no tracked file of ${unknown.join(', ')}: name ${written.join(', ')}`);
        process.exit(1);
      }
      const dirs = (names.length ? names : written).map(checkoutDir);
      for (const dir of dirs) Underpost.repo.declareSafeDirectory(dir);
      shellExec(`node bin run clean ${dirs.join(',')}`);
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
