/**
 * Versioned Cyberia content releases.
 *
 * Content (instances, maps, entities, actions, quests, the item catalog and the Object Layer
 * cache) lives in the `content` partition of the Cyberia host. A release is built into its
 * own database under that partition, validated there, and promoted by pointing the partition
 * at it. Runtime state (players, sessions, quest progress) stays in the host database and no
 * content operation touches it.
 *
 * @module src/projects/cyberia/content-release.js
 * @namespace CyberiaContentRelease
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { domainOrigin } from '../../server/domain/domain-client.js';
import { publishObjectLayer, resolveObjectLayer } from '../../server/domain/object-layer-resolver.js';
import { objectLayerIdentity, renderContractOf } from '../../api/object-layer/object-layer.identity.js';
import { isProfileRef } from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { PINNED_REFERENCES, readItemRefs } from '../../api/cyberia-item-catalog/item-ref.js';
import { RELEASE_ID_PATTERN } from '../../api/cyberia-content-release/cyberia-content-release.model.js';
import { triggerHotReload } from './hot-reload-trigger.js';
import { CyberiaObjectLayerProfile } from '../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { AtlasSpriteSheetStore } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { MongooseDB } from '../../db/mongo/MongooseDB.js';

const logger = loggerFactory(import.meta);

/** The partition a Cyberia host declares for its content. */
export const CONTENT_PARTITION = 'content';

/** How often a running engine looks for a promoted release. `0` disables the watch. */
export const RELEASE_WATCH_MS = Number(process.env.CYBERIA_CONTENT_RELEASE_WATCH_MS ?? 15000);

/** Cap on finding lines one check keeps, so a broken release reads as a report, not a dump. */
const MAX_FINDINGS = 25;

/**
 * A valid release id, or an error.
 * @param {string} releaseId
 * @returns {string}
 * @memberof CyberiaContentRelease
 */
export function assertReleaseId(releaseId) {
  const id = String(releaseId ?? '').trim();
  if (!RELEASE_ID_PATTERN.test(id))
    throw new Error(`Invalid release id "${releaseId}": use lower-case letters, digits and dashes`);
  return id;
}

/**
 * The database one release lives in.
 * @param {string} base - The content partition's base database name.
 * @param {string} releaseId
 * @returns {string}
 * @memberof CyberiaContentRelease
 */
export const releaseDatabaseName = (base, releaseId) => `${base}-${assertReleaseId(releaseId)}`;

/**
 * One ledger row as `content-release status` prints it. It starts `<status> <release-id>`, which
 * the deploy scripts parse.
 * @param {Object} entry - A CyberiaContentRelease document.
 * @returns {string}
 * @memberof CyberiaContentRelease
 */
export const contentReleaseRowFactory = (entry) =>
  `${entry.status.padEnd(9)} ${entry.releaseId}  ${entry.database}  ${entry.instances.join(',')}  commit=${entry.source?.commit || '-'}`;

/**
 * The content partition a host's db configuration declares.
 * @param {Object} db - Resolved `db` entry of the host.
 * @returns {{name:string,apis:string[]}}
 * @throws {Error} When the host declares no content partition.
 * @memberof CyberiaContentRelease
 */
export function contentPartitionOf(db) {
  const partition = db?.partitions?.[CONTENT_PARTITION];
  if (!partition?.name)
    throw new Error(`The host declares no "${CONTENT_PARTITION}" partition; content releases need one`);
  return { name: partition.name, apis: [...(partition.apis ?? [])] };
}

/**
 * The same db configuration with the content partition pointed at one release database.
 * @param {Object} db - Resolved `db` entry of the host.
 * @param {string} releaseId
 * @returns {{db:Object,database:string,base:string}}
 * @memberof CyberiaContentRelease
 */
export function releaseDbConf(db, releaseId) {
  const partition = contentPartitionOf(db);
  const database = releaseDatabaseName(partition.name, releaseId);
  return {
    base: partition.name,
    database,
    db: { ...db, partitions: { ...db.partitions, [CONTENT_PARTITION]: { ...partition, name: database } } },
  };
}

const check = (name) => ({ name, ok: true, count: 0, findings: [] });

/** Why a check against the Object Layer authority did not run. Only a development host skips. */
const authoritySkipReason = (options) =>
  options?.consumes?.['object-layer']
    ? 'no Object Layer authority origin is configured'
    : 'this deployment is the Object Layer authority';
const fail = (entry, message) => {
  entry.ok = false;
  if (entry.findings.length < MAX_FINDINGS) entry.findings.push(message);
};

/**
 * Whether a document's stored identity is the identity of its content.
 * @param {Object} doc - Lean ObjectLayer document.
 * @returns {string} Empty when consistent, else why not.
 */
const identityDefect = (doc) => {
  if (!isProfileRef(doc.profile)) return `${doc.cid}: profile is not a valid profile reference`;
  const identity = objectLayerIdentity(doc);
  if (identity.cid !== doc.cid) return `${doc.cid}: content hashes to ${identity.cid}`;
  if (identity.contentHash !== doc.contentHash)
    return `${doc.cid}: contentHash ${doc.contentHash} is not the content's`;
  return '';
};

/**
 * Validates a release's content. Every check runs; the report says which failed and why.
 *
 * - `catalog`: every bound label names a published definition in the release, under the Cyberia
 *   runtime's profile, whose identity is its content's.
 * - `canonical`: every bound cid resolves at the Object Layer authority, with the same digest.
 *   Skipped, and said so, when this deployment is the authority.
 * - `pinned-references`: every pinned quest and action reference names a cached definition.
 * - `labels`: every label a map entity or entity default uses is bound in the catalog.
 * - `render`: the atlas each bound definition points at holds the render it names: its primary
 *   render and its layout address `data.render`.
 * - `instances`: every instance has its conf and every map it lists.
 * - `schema`: every content document passes its schema.
 *
 * @param {Object} models - Content models of the release: `CyberiaItemCatalog`, `ObjectLayer`,
 *   `AtlasSpriteSheet`, `File`, `CyberiaQuest`, `CyberiaAction`, `CyberiaMap`,
 *   `CyberiaEntityTypeDefault`, `CyberiaInstance`, `CyberiaInstanceConf`.
 * @param {Object} [params]
 * @param {import('../../api/types.js').RouterOptions} [params.options] - Router options of the host, for the canonical resolver.
 * @param {(cid:string)=>Promise<Object|null>} [params.resolveCanonical] - Canonical lookup; defaults to the domain resolver.
 * @returns {Promise<{ok:boolean,checkedAt:Date,checks:Array<{name:string,ok:boolean,count:number,findings:string[]}>,manifest:Object,dependencies:string[]}>}
 * @memberof CyberiaContentRelease
 */
export async function validateContentRelease(models, { options, resolveCanonical } = {}) {
  const checks = [];

  const catalog = await models.CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1 }).lean();
  const boundCids = [...new Set(catalog.map((entry) => entry.objectLayerCid))];
  const cached = new Map(
    (await models.ObjectLayer.find({ cid: { $in: boundCids } }).lean()).map((doc) => [doc.cid, doc]),
  );

  const catalogCheck = check('catalog');
  catalogCheck.count = catalog.length;
  for (const entry of catalog) {
    const doc = cached.get(entry.objectLayerCid);
    if (!doc) {
      fail(catalogCheck, `${entry.itemId} → ${entry.objectLayerCid}: not in the release cache`);
      continue;
    }
    const defect = identityDefect(doc);
    if (defect) fail(catalogCheck, `${entry.itemId}: ${defect}`);
    else if (doc.origin === 'draft') fail(catalogCheck, `${entry.itemId}: ${doc.cid} is a draft, never published`);
    else if (
      doc.profile.id !== CyberiaObjectLayerProfile.id ||
      doc.profile.version !== CyberiaObjectLayerProfile.version
    )
      fail(
        catalogCheck,
        `${entry.itemId}: profile ${doc.profile.id}@${doc.profile.version} is not the Cyberia runtime's ${CyberiaObjectLayerProfile.id}@${CyberiaObjectLayerProfile.version}`,
      );
  }
  checks.push(catalogCheck);

  const canonicalCheck = check('canonical');
  const authority = domainOrigin('object-layer');
  const resolve = resolveCanonical ?? (authority ? (cid) => resolveObjectLayer(cid, options) : null);
  if (!resolve) {
    canonicalCheck.findings.push(`skipped: ${authoritySkipReason(options)}`);
  } else {
    canonicalCheck.count = boundCids.length;
    for (const cid of boundCids) {
      try {
        const canonical = await resolve(cid);
        if (!canonical) fail(canonicalCheck, `${cid}: unknown to the Object Layer authority`);
        else if (canonical.contentHash !== cached.get(cid)?.contentHash)
          fail(canonicalCheck, `${cid}: the cached content differs from the authority`);
      } catch (error) {
        fail(canonicalCheck, `${cid}: ${error.message}`);
      }
    }
  }
  checks.push(canonicalCheck);

  const pinnedCheck = check('pinned-references');
  const pinned = [];
  for (const [collection, references] of Object.entries(PINNED_REFERENCES)) {
    for (const document of await models[collection].find({}).lean()) {
      for (const ref of readItemRefs(document, references)) pinned.push({ collection, code: document.code, ...ref });
    }
  }
  pinnedCheck.count = pinned.length;
  const pinnedCids = [...new Set(pinned.map((ref) => ref.cid).filter(Boolean))];
  const pinnedKnown = new Set(
    (await models.ObjectLayer.find({ cid: { $in: pinnedCids } }, { cid: 1 }).lean()).map((doc) => doc.cid),
  );
  for (const ref of pinned) {
    if (!ref.cid) fail(pinnedCheck, `${ref.collection} ${ref.code}: ${ref.itemId} is not pinned`);
    else if (!pinnedKnown.has(ref.cid))
      fail(pinnedCheck, `${ref.collection} ${ref.code}: ${ref.itemId} pins ${ref.cid}, not in the release cache`);
  }
  checks.push(pinnedCheck);

  const labelsCheck = check('labels');
  const bound = new Set(catalog.map((entry) => entry.itemId));
  const used = new Map();
  for (const map of await models.CyberiaMap.find({}, { code: 1, 'entities.objectLayerItemIds': 1 }).lean()) {
    for (const entity of map.entities ?? []) {
      for (const itemId of entity.objectLayerItemIds ?? []) used.set(itemId, `map ${map.code}`);
    }
  }
  for (const entityDefault of await models.CyberiaEntityTypeDefault.find(
    {},
    { entityType: 1, liveItemIds: 1 },
  ).lean()) {
    for (const itemId of entityDefault.liveItemIds ?? [])
      used.set(itemId, `entity default ${entityDefault.entityType}`);
  }
  labelsCheck.count = used.size;
  for (const [itemId, where] of used)
    if (!bound.has(itemId)) fail(labelsCheck, `${where}: label "${itemId}" is not bound`);
  checks.push(labelsCheck);

  // The runtime fetches the primary render of the atlas a bound definition points at
  // (`/atlas-sprite-sheet/blob/<label>`): its bytes and its layout must address `data.render`.
  const renderCheck = check('render');
  const rendering = catalog.filter((entry) => cached.get(entry.objectLayerCid)?.data?.render?.cid);
  renderCheck.count = rendering.length;
  for (const entry of rendering) {
    const { data } = cached.get(entry.objectLayerCid);
    const atlas = await models.AtlasSpriteSheet.findOne(
      { objectLayerCid: entry.objectLayerCid },
      { fileId: 1, metadata: 1 },
    ).lean();
    // Hydrated, not lean: a lean read hands back a BSON Binary the hash cannot read.
    const primary = atlas?.fileId ? await models.File.findById(atlas.fileId, { data: 1 }) : null;
    if (!primary?.data) {
      fail(renderCheck, `${entry.itemId} (${entry.objectLayerCid}): no stored primary render`);
      continue;
    }
    const stored = renderContractOf({ primary: Buffer.from(primary.data), metadata: atlas.metadata });
    const named = data.render;
    if (stored.cid !== named.cid || stored.metadataCid !== named.metadataCid)
      fail(
        renderCheck,
        `${entry.itemId}: the atlas holds render ${stored.cid} + ${stored.metadataCid}, the definition names ${named.cid} + ${named.metadataCid}`,
      );
  }
  checks.push(renderCheck);

  const instancesCheck = check('instances');
  const instances = await models.CyberiaInstance.find({}, { code: 1, conf: 1, cyberiaMapCodes: 1 }).lean();
  instancesCheck.count = instances.length;
  const mapCodes = new Set((await models.CyberiaMap.find({}, { code: 1 }).lean()).map((map) => map.code));
  const confIds = new Set(
    (await models.CyberiaInstanceConf.find({}, { _id: 1 }).lean()).map((conf) => String(conf._id)),
  );
  for (const instance of instances) {
    if (!instance.conf || !confIds.has(String(instance.conf)))
      fail(instancesCheck, `instance ${instance.code}: conf missing`);
    for (const code of instance.cyberiaMapCodes ?? []) {
      if (!mapCodes.has(code)) fail(instancesCheck, `instance ${instance.code}: map "${code}" missing`);
    }
  }
  checks.push(instancesCheck);

  const schemaCheck = check('schema');
  for (const name of [
    'CyberiaInstance',
    'CyberiaInstanceConf',
    'CyberiaMap',
    'CyberiaQuest',
    'CyberiaAction',
    'CyberiaItemCatalog',
    'ObjectLayer',
  ]) {
    const Model = models[name];
    if (!Model) continue;
    for await (const doc of Model.find({}).cursor()) {
      schemaCheck.count++;
      try {
        await doc.validate();
      } catch (error) {
        fail(schemaCheck, `${name} ${doc.code ?? doc.itemId ?? doc.cid ?? doc._id}: ${error.message}`);
      }
    }
  }
  checks.push(schemaCheck);

  const dependencies = [...new Set([...boundCids, ...pinnedCids])].sort();
  const manifest = {
    instances: instances.map((instance) => instance.code).sort(),
    maps: mapCodes.size,
    bindings: catalog.length,
    quests: await models.CyberiaQuest.countDocuments(),
    actions: await models.CyberiaAction.countDocuments(),
  };
  return { ok: checks.every((entry) => entry.ok), checkedAt: new Date(), checks, manifest, dependencies };
}

/**
 * Stores every definition a release binds at the Object Layer authority, so the canonical pool
 * holds all the content the release will serve. Idempotent: the authority answers known content
 * with the identity it already has. A no-op when this deployment is the authority.
 * @param {Object} models - Content models of the release: `CyberiaItemCatalog`, `ObjectLayer`.
 * @param {Object} [params]
 * @param {import('../../api/types.js').RouterOptions} [params.options] - Router options of the host.
 * @param {(definition:Object)=>Promise<{cid:string,created:boolean}>} [params.publish] - Defaults to the domain publisher.
 * @returns {Promise<{name:string,ok:boolean,count:number,findings:string[],created:number}>}
 * @memberof CyberiaContentRelease
 */
export async function publishContentRelease(models, { options, publish } = {}) {
  const entry = { ...check('publication'), created: 0 };
  const send = publish ?? (domainOrigin('object-layer') ? publishObjectLayer : null);
  if (!send) {
    entry.findings.push(`skipped: ${authoritySkipReason(options)}`);
    return entry;
  }
  const cids = [...new Set(await models.CyberiaItemCatalog.distinct('objectLayerCid'))];
  for (const doc of await models.ObjectLayer.find({ cid: { $in: cids } }).lean()) {
    entry.count++;
    try {
      const stored = await send(doc);
      if (stored?.cid !== doc.cid) fail(entry, `${doc.cid}: the authority stored it as ${stored?.cid}`);
      else if (stored.created) entry.created++;
    } catch (error) {
      fail(entry, `${doc.cid}: ${error.message}`);
    }
  }
  return entry;
}

/**
 * Runs `fn` in one transaction on the model's connection: every write lands, or none does.
 * @param {import('mongoose').Model} Model
 * @param {(session:Object)=>Promise<*>} fn
 * @returns {Promise<*>} What `fn` returns.
 */
const inTransaction = async (Model, fn) => {
  const session = await Model.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await fn(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
};

/**
 * Makes a validated release the active one, in one transaction: the release before it is
 * retired and stays the rollback target, the new one turns active, or nothing changes. The
 * ledger's unique index allows one active release, so a concurrent promotion fails whole.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {string} releaseId
 * @returns {Promise<{active:Object,retired:Object|null}>}
 * @memberof CyberiaContentRelease
 */
export async function promoteContentRelease(CyberiaContentRelease, releaseId) {
  const id = assertReleaseId(releaseId);
  const result = await inTransaction(CyberiaContentRelease, async (session) => {
    const release = await CyberiaContentRelease.findOne({ releaseId: id }).session(session).lean();
    if (!release) throw new Error(`Release "${id}" does not exist`);
    if (release.status === 'active') return { active: release, retired: null };
    if (release.status !== 'validated' && release.status !== 'retired')
      throw new Error(`Release "${id}" is ${release.status}; only a validated release can be promoted`);
    if (!release.validation?.ok) throw new Error(`Release "${id}" has no passing validation`);

    const now = new Date();
    const retired = await CyberiaContentRelease.findOneAndUpdate(
      { status: 'active' },
      { $set: { status: 'retired', retiredAt: now } },
      { returnDocument: 'after', session },
    ).lean();
    const active = await CyberiaContentRelease.findOneAndUpdate(
      { releaseId: id },
      { $set: { status: 'active', promotedAt: now, retiredAt: null } },
      { returnDocument: 'after', session },
    ).lean();
    return { active, retired };
  });
  if (result.retired || result.active.promotedAt)
    logger.info(`Content release active: ${id}${result.retired ? ` (retired ${result.retired.releaseId})` : ''}`);
  return result;
}

/**
 * Retires the active release without a successor: the runtime serves the workspace again, and
 * the release stays the rollback target. The explicit exit of a local release rehearsal.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @returns {Promise<Object>} The retired release.
 * @throws {Error} When no release is active.
 * @memberof CyberiaContentRelease
 */
export async function retireContentRelease(CyberiaContentRelease) {
  const retired = await CyberiaContentRelease.findOneAndUpdate(
    { status: 'active' },
    { $set: { status: 'retired', retiredAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!retired) throw new Error('No release is active; the runtime already serves the workspace');
  logger.info(`Content release retired: ${retired.releaseId}; the workspace serves until a promotion`);
  return retired;
}

/**
 * Re-promotes the release that was active before the current one, in one transaction.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @returns {Promise<{active:Object,retired:Object|null}>}
 * @memberof CyberiaContentRelease
 */
export async function rollbackContentRelease(CyberiaContentRelease) {
  const previous = await CyberiaContentRelease.previousActive();
  if (!previous) throw new Error('No previous release to roll back to');
  return await promoteContentRelease(CyberiaContentRelease, previous.releaseId);
}

/**
 * Copies the workspace content into a release database: every collection of the content
 * partition, drafts left out. Each collection is replaced whole, so a rebuilt candidate never
 * keeps what the workspace no longer holds. The workspace is only read.
 * @param {Object} params
 * @param {import('mongoose').Connection} params.connection - A connection on the content server.
 * @param {string} params.workspace - Workspace database.
 * @param {string} params.database - Release database.
 * @param {string[]} params.apis - APIs of the content partition.
 * @returns {Promise<Object<string,number>>} Collection → documents copied.
 * @memberof CyberiaContentRelease
 */
export async function materializeWorkspace({ connection, workspace, database, apis }) {
  if (workspace === database) throw new Error('A release database cannot be the workspace');
  const copied = {};
  for (const api of apis) {
    const source = await MongooseDB.bindModel(connection.useDb(workspace, { useCache: true }), api);
    const collection = source.collection.collectionName;
    const match = source.modelName === 'ObjectLayer' ? [{ $match: { origin: { $ne: 'draft' } } }] : [];
    await source.aggregate([...match, { $out: { db: database, coll: collection } }]);
    // `$out` fails when the target's indexes change under it, so the target model binds after.
    const target = await MongooseDB.bindModel(connection.useDb(database, { useCache: true }), api);
    await target.init();
    await target.syncIndexes();
    copied[collection] = await target.countDocuments();
  }
  return copied;
}

/**
 * Drops the databases of retired releases beyond the newest `keep`, never the active release
 * and never the rollback target, then removes the atlas renders no kept release points at.
 * @param {Object} params
 * @param {import('mongoose').Model} params.CyberiaContentRelease
 * @param {import('mongoose').Connection} params.connection - A connection on the content server.
 * @param {{host:string,path:string}} [params.context] - Host context; when given, orphaned atlas renders are removed.
 * @param {string} [params.baseDatabase] - The partition's base database, kept like a release.
 * @param {number} [params.keep=2] - Retired releases to keep, newest first.
 * @returns {Promise<string[]>} The release ids removed.
 * @memberof CyberiaContentRelease
 */
export async function pruneContentReleases({
  CyberiaContentRelease,
  connection,
  context,
  baseDatabase = '',
  keep = 2,
}) {
  const retired = await CyberiaContentRelease.find({ status: { $in: ['retired', 'invalid', 'candidate'] } })
    .sort({ retiredAt: -1, createdAt: -1 })
    .lean();
  const rollbackTarget = await CyberiaContentRelease.previousActive();
  const removable = retired
    .filter((release) => release.releaseId !== rollbackTarget?.releaseId)
    .slice(Math.max(0, keep));
  const removed = [];
  for (const release of removable) {
    await connection.useDb(release.database, { useCache: true }).dropDatabase();
    await CyberiaContentRelease.deleteOne({ releaseId: release.releaseId });
    removed.push(release.releaseId);
  }
  if (removed.length) logger.info(`Content releases pruned: ${removed.join(', ')}`);
  if (context) {
    const kept = (await CyberiaContentRelease.find({}, { database: 1 }).lean()).map((release) => release.database);
    const owners = [];
    for (const database of new Set([baseDatabase, ...kept].filter(Boolean)))
      owners.push(await MongooseDB.bindModel(connection.useDb(database, { useCache: true }), 'atlas-sprite-sheet'));
    await AtlasSpriteSheetStore.pruneOrphanRenders({ options: context, owners });
  }
  return removed;
}

/**
 * Makes the content partition of a running host serve its active release. With no promotion
 * yet, it serves the workspace. Authoring keeps reading the workspace either way.
 * @param {{host:string,path:string}} context
 * @returns {Promise<{releaseId:string,database:string,changed:boolean}|null>} Null when the host has no content partition.
 * @memberof CyberiaContentRelease
 */
export async function activateContentRelease(context) {
  const bucket = DataBaseProviderService.getProvider(context, 'mongoose');
  if (!bucket.partitions?.[CONTENT_PARTITION] || !bucket.models.CyberiaContentRelease) return null;
  const active = await bucket.models.CyberiaContentRelease.active();
  const target = active?.database ?? bucket.partitions[CONTENT_PARTITION].name;
  const { previous, database } = await DataBaseProviderService.serveDatabase(context, CONTENT_PARTITION, target);
  return { releaseId: active?.releaseId ?? '', database, changed: previous !== database };
}

/**
 * Asks every registered Cyberia server to rebuild its world from the content now served.
 * @param {{host:string,path:string}} context
 * @returns {Promise<number>} Servers reached.
 * @memberof CyberiaContentRelease
 */
export async function reloadContentServers(context) {
  const Registry = DataBaseProviderService.getProvider(context, 'mongoose').models.CyberiaServerRegistry;
  if (!Registry) return 0;
  let reached = 0;
  for (const server of await Registry.find({}, { serverUrl: 1, instanceCode: 1 }).lean()) {
    try {
      await triggerHotReload({ serverUrl: server.serverUrl, instanceCode: server.instanceCode, mode: 'full' });
      reached++;
    } catch (error) {
      logger.warn(`Hot reload of ${server.serverUrl} failed: ${error.message}`);
    }
  }
  return reached;
}

/**
 * Follows promotions while the engine runs: when the active release changes, the partition is
 * rebound and the game servers reload. The poll is one small query per interval.
 * @param {{host:string,path:string}} context
 * @param {Object} [params]
 * @param {number} [params.intervalMs=RELEASE_WATCH_MS]
 * @returns {{stop:()=>void}|null} Null when disabled or the host has no content partition.
 * @memberof CyberiaContentRelease
 */
export function watchContentRelease(context, { intervalMs = RELEASE_WATCH_MS } = {}) {
  if (!(intervalMs > 0)) return null;
  const bucket = DataBaseProviderService.getProvider(context, 'mongoose');
  if (!bucket.partitions?.[CONTENT_PARTITION] || !bucket.models.CyberiaContentRelease) return null;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await activateContentRelease(context);
      if (result?.changed) {
        logger.info(`Content release ${result.releaseId} is now served from ${result.database}`);
        await reloadContentServers(context);
      }
    } catch (error) {
      logger.warn(`Content release watch failed: ${error.message}`);
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
