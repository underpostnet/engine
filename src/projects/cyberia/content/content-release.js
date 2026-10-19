/**
 * Versioned Cyberia content releases.
 *
 * Content (instances, maps, entities, actions, quests, the item catalog and the Object Layer
 * cache) lives in the `content` partition of the Cyberia host. A release is built into its
 * own database under that partition, validated there, and promoted by pointing the partition
 * at it. Runtime state (players, sessions, quest progress) stays in the host database and no
 * content operation touches it.
 *
 * @module src/projects/cyberia/content/content-release.js
 * @namespace CyberiaContentRelease
 */
import crypto from 'crypto';
import canonicalize from 'canonicalize';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { domainOrigin } from '../../../server/domain/domain-client.js';
import { publishObjectLayer, resolveObjectLayer } from '../../../server/domain/object-layer-resolver.js';
import { objectLayerIdentity, renderContractOf } from '../../../api/object-layer/object-layer.identity.js';
import { isProfileRef } from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { findLegacyPins } from '../catalog/catalog-consistency.js';
import {
  collectInstanceItemIds,
  collectSummonedItemIds,
  isMaterialItemId,
  skillDefect,
} from '../../../api/cyberia-instance/cyberia-instance-items.js';
import { triggerHotReload } from '../runtime/hot-reload-trigger.js';
import { liveEndpoints } from '../../../api/cyberia-server-registry/cyberia-server-registry.service.js';
import { CyberiaObjectLayerProfile } from '../../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { AtlasSpriteSheetStore } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { pruneUnreferencedContent } from '../../../api/object-layer/object-layer.ipfs.js';
import { MongooseDB } from '../../../db/mongo/MongooseDB.js';
import { assertReleaseId } from '../../../server/release/source-release.js';
import { loadContentArtifact, serveContentArtifact, servedContentArtifact } from './content-artifact.js';
import { catalogRegistryModels, reconcileMapRegistry, registryDefects } from '../instance/map-registry.js';

const logger = loggerFactory(import.meta);

/** The partition a Cyberia host declares for its content. */
export const CONTENT_PARTITION = 'content';

/** How often a running engine looks for a promoted release. `0` disables the watch. */
export const RELEASE_WATCH_MS = Number(process.env.CYBERIA_CONTENT_RELEASE_WATCH_MS ?? 15000);

/** A lease older than this belongs to an execution that stopped: its release may be built again. */
export const RELEASE_LEASE_MS = Number(process.env.CYBERIA_CONTENT_RELEASE_LEASE_MS ?? 2 * 60 * 60 * 1000);

/** Cap on finding lines one check keeps, so a broken release reads as a report, not a dump. */
const MAX_FINDINGS = 25;

/**
 * The database one release lives in.
 * @param {string} base - The content partition's base database name.
 * @param {string} releaseId
 * @returns {string}
 * @memberof CyberiaContentRelease
 */
export const releaseDatabaseName = (base, releaseId) => `${base}-${assertReleaseId(releaseId)}`;

/**
 * Imports the content artifact in dependency order: the foundation, the sagas, then each instance.
 * Each saga moves what it holds to the artifact, and each instance restores what it holds. Each
 * import starts only once the one before it succeeded, so no instance reaches a store that lacks
 * its foundation.
 * @param {Object} params
 * @param {(args:string)=>Promise<void>} params.run - Runs one `cyberia` command line; rejects when it fails.
 * @param {string[]} params.instances - Instance codes.
 * @param {string[]} [params.sagas=[]] - Saga codes.
 * @param {string} [params.releaseId] - The release database to import into; the workspace without one.
 * @returns {Promise<void>}
 * @memberof CyberiaContentRelease
 */
export async function importArtifactContent({ run, instances, sagas = [], releaseId = '' }) {
  const target = releaseId ? ` --release ${assertReleaseId(releaseId)}` : '';
  await run(`content import${target}`);
  for (const code of sagas) await run(`content import --saga ${code} --rebind${target}`);
  for (const code of instances) await run(`instance ${code} --import${target}`);
}

/**
 * One ledger row as `content-release status` prints it. It starts `<status> <release-id>`, which
 * the deploy scripts parse.
 * @param {Object} entry - A CyberiaContentRelease document.
 * @returns {string}
 * @memberof CyberiaContentRelease
 */
export const contentReleaseRowFactory = (entry) =>
  `${entry.status.padEnd(9)} ${entry.releaseId}  ${entry.database}  ${entry.instances.join(',')}  ` +
  `source=${entry.source?.channel || entry.source?.from || '-'}@${entry.source?.sourceRevision?.slice(0, 12) || '-'}  ` +
  `engine=${entry.provenance?.engineCommit || '-'}`;

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
 * - `artifact`: the release database holds, complete and unaltered, the content artifact the
 *   release records. Skipped, and said so, for the workspace, which holds none.
 * - `catalog`: every bound label names a published definition in the release, under the Cyberia
 *   runtime's profile, whose identity is its content's.
 * - `canonical`: every bound cid resolves at the Object Layer authority, with the same digest.
 *   Skipped, and said so, when this deployment is the authority.
 * - `legacy-pins`: no quest or action pins a definition: the catalog alone binds each item.
 * - `labels`: every label a map entity or entity default uses is bound in the catalog.
 * - `skills`: every skill document can run: see `skillDefect`.
 * - `render`: the atlas each bound definition points at holds the render it names: its primary
 *   render and its layout address `data.render`.
 * - `instances`: every instance has its conf and every map it lists.
 * - `schema`: every content document passes its schema.
 *
 * @param {Object} models - Content models of the release: `CyberiaItemCatalog`, `ObjectLayer`,
 *   `AtlasSpriteSheet`, `File`, `CyberiaQuest`, `CyberiaAction`, `CyberiaMap`,
 *   `CyberiaEntityTypeDefault`, `CyberiaSkill`, `CyberiaInstance`, `CyberiaInstanceConf`.
 * @param {Object} [params]
 * @param {import('../../../api/types.js').RouterOptions} [params.options] - Router options of the host, for the canonical resolver.
 * @param {(cid:string)=>Promise<Object|null>} [params.resolveCanonical] - Canonical lookup; defaults to the domain resolver.
 * @param {{db:import('mongodb').Db, digest:string}} [params.artifact] - The release database and the
 *   content digest the release records; absent for the workspace.
 * @returns {Promise<{ok:boolean,checkedAt:Date,checks:Array<{name:string,ok:boolean,count:number,findings:string[]}>,manifest:Object,dependencies:string[]}>}
 * @memberof CyberiaContentRelease
 */
export async function validateContentRelease(models, { options, resolveCanonical, artifact } = {}) {
  const checks = [];

  const artifactCheck = check('artifact');
  if (!artifact) artifactCheck.findings.push('skipped: the workspace holds no content artifact');
  else
    try {
      artifactCheck.count = (await loadContentArtifact(artifact.db, artifact.digest)).files.length;
    } catch (error) {
      fail(artifactCheck, error.message);
    }
  checks.push(artifactCheck);

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

  const legacyCheck = check('legacy-pins');
  const legacy = await findLegacyPins(models);
  legacyCheck.count = legacy.documents.length;
  for (const { collection, code, pins } of legacy.documents)
    fail(legacyCheck, `${collection} ${code}: pins ${pins.map(({ itemId, cid }) => `${itemId} → ${cid}`).join(', ')}`);
  checks.push(legacyCheck);

  // Every label the content names, by the rule the boot payload and the export use, with the
  // first document that names it.
  const labelsCheck = check('labels');
  const bound = new Set(catalog.map((entry) => entry.itemId));
  const used = new Map();
  const name = (where, itemIds) => {
    for (const itemId of itemIds) if (isMaterialItemId(itemId) && !used.has(itemId)) used.set(itemId, where);
  };
  for (const map of await models.CyberiaMap.find({}, { code: 1, 'entities.objectLayerItemIds': 1 }).lean())
    name(`map ${map.code}`, collectInstanceItemIds({ maps: [map] }));
  for (const entityDefault of await models.CyberiaEntityTypeDefault.find({}).lean())
    name(`entity default ${entityDefault.entityType}`, collectInstanceItemIds({ entityDefaults: [entityDefault] }));
  for (const action of await models.CyberiaAction.find({}).lean())
    name(`action ${action.code}`, collectInstanceItemIds({ actions: [action] }));
  for (const quest of await models.CyberiaQuest.find({}).lean())
    name(`quest ${quest.code}`, collectInstanceItemIds({ quests: [quest] }));
  const skills = await models.CyberiaSkill.find({}).lean();
  for (const skill of skills)
    name(`skill ${skill.triggerItemId}`, [skill.triggerItemId, ...collectSummonedItemIds([skill])]);
  labelsCheck.count = used.size;
  for (const [itemId, where] of used)
    if (!bound.has(itemId)) fail(labelsCheck, `${where}: label "${itemId}" is not bound`);
  checks.push(labelsCheck);

  const skillsCheck = check('skills');
  skillsCheck.count = skills.length;
  for (const skill of skills) {
    const defect = skillDefect(skill);
    if (defect) fail(skillsCheck, `skill ${skill.triggerItemId || skill._id}: ${defect}`);
  }
  checks.push(skillsCheck);

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
  const maps = await models.CyberiaMap.find({}, { code: 1, worldX: 1, worldY: 1, gridX: 1, gridY: 1 }).lean();
  const confIds = new Set(
    (await models.CyberiaInstanceConf.find({}, { _id: 1 }).lean()).map((conf) => String(conf._id)),
  );
  for (const instance of instances) {
    if (!instance.conf || !confIds.has(String(instance.conf)))
      fail(instancesCheck, `instance ${instance.code}: conf missing`);
  }
  // Map ownership and world placement: the defects the map registry of the release would refuse.
  for (const defect of registryDefects(maps, instances)) fail(instancesCheck, defect);
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

  const dependencies = [...boundCids].sort();
  const manifest = {
    instances: instances.map((instance) => instance.code).sort(),
    maps: maps.length,
    bindings: catalog.length,
    quests: await models.CyberiaQuest.countDocuments(),
    actions: await models.CyberiaAction.countDocuments(),
  };
  return { ok: checks.every((entry) => entry.ok), checkedAt: new Date(), checks, manifest, dependencies };
}

/** The content a live change can alter: the worlds and their item bindings, which `instance --export` writes out. */
const LIVE_CONTENT_APIS = Object.freeze([
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-map',
  'cyberia-quest',
  'cyberia-action',
  'cyberia-dialogue',
  'cyberia-skill',
  'cyberia-entity-type-default',
  'cyberia-item-catalog',
]);

/** Fields a write sets on its own: timestamps, version keys, save revisions and generated pictures. */
const GENERATED_FIELDS = Object.freeze(['createdAt', 'updatedAt', '__v', 'revision', 'preview', 'previewKey']);

/**
 * A digest per content API of what a content database holds, generated fields left out. Two
 * databases with the same documents have the same fingerprint.
 * @param {import('mongoose').Connection} store - The content database.
 * @returns {Promise<Object<string,string>>} API → sha256 hex.
 * @memberof CyberiaContentRelease
 */
export async function contentFingerprint(store) {
  const projection = Object.fromEntries(GENERATED_FIELDS.map((field) => [field, 0]));
  const fingerprint = {};
  for (const api of LIVE_CONTENT_APIS) {
    const Model = await MongooseDB.bindModel(store, api);
    const hash = crypto.createHash('sha256');
    for await (const doc of Model.find({}, projection).sort({ _id: 1 }).lean().cursor())
      hash.update(canonicalize(JSON.parse(JSON.stringify(doc)))).update('\n');
    fingerprint[api] = hash.digest('hex');
  }
  return fingerprint;
}

/**
 * The content APIs the active release changed after its build: the live changes a promotion
 * stops serving. They stay in the release database until a prune drops it.
 * @param {Object} params
 * @param {import('mongoose').Model} params.CyberiaContentRelease
 * @param {import('mongoose').Connection} params.connection - A connection on the content server.
 * @returns {Promise<{release:Object|null,known:boolean,changed:string[]}>} The active release, whether it
 *   records the fingerprint of its build, and the APIs it changed since.
 * @memberof CyberiaContentRelease
 */
export async function liveChanges({ CyberiaContentRelease, connection }) {
  const release = await CyberiaContentRelease.active();
  if (!release?.fingerprint) return { release, known: !release, changed: [] };
  const current = await contentFingerprint(connection.useDb(release.database, { useCache: true }));
  return {
    release,
    known: true,
    changed: LIVE_CONTENT_APIS.filter((api) => current[api] !== release.fingerprint[api]),
  };
}

/**
 * Stores every definition a release binds at the Object Layer authority, so the canonical pool
 * holds all the content the release will serve. Idempotent: the authority answers known content
 * with the identity it already has. A no-op when this deployment is the authority.
 * @param {Object} models - Content models of the release: `CyberiaItemCatalog`, `ObjectLayer`.
 * @param {Object} [params]
 * @param {import('../../../api/types.js').RouterOptions} [params.options] - Router options of the host.
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

const leaseLive = (release, leaseMs) =>
  !!release?.lease?.heartbeatAt && Date.now() - new Date(release.lease.heartbeatAt).getTime() < leaseMs;

const sameSource = (a = {}, b = {}) =>
  (a.from ?? 'backups') === (b.from ?? 'backups') && (a.sourceRevision ?? '') === (b.sourceRevision ?? '');

/**
 * Ends a building or candidate release as `failed`, naming the stage, and frees the execution.
 * The active release keeps serving.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {string} releaseId
 * @param {string} stage
 * @param {Error|string} error
 * @returns {Promise<Object|null>} The release, or null when it was not executing.
 * @memberof CyberiaContentRelease
 */
export async function failContentRelease(CyberiaContentRelease, releaseId, stage, error) {
  return await CyberiaContentRelease.findOneAndUpdate(
    { releaseId, status: { $in: ['building', 'candidate'] } },
    {
      $set: {
        status: 'failed',
        failure: { stage, message: String(error?.message ?? error).slice(0, 2000), at: new Date() },
      },
      $unset: { lease: 1 },
    },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Opens a release, or builds a failed one again, and takes the one execution lease.
 *
 * - A new id starts `building`.
 * - A `validated`, `active` or `retired` release is kept as it is: `skipped` is true.
 * - A `failed` release, or one whose lease expired, is built again from the same source.
 * - An id built from another source is refused: another source needs another release.
 *
 * Every build that runs starts from an empty candidate database: `reset` removes it first, so no
 * document of an earlier attempt survives into the release.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {Object} params
 * @param {string} params.releaseId
 * @param {string} params.holder - Who executes: a Job pod or a host.
 * @param {Object} params.fields - `database`, `instances`, `source` and the rest the release records.
 * @param {(database:string)=>Promise<void>} [params.reset] - Removes the candidate database.
 * @param {number} [params.leaseMs]
 * @returns {Promise<{release:Object, skipped:boolean}>}
 * @throws {Error} On another source, or while another release executes.
 * @memberof CyberiaContentRelease
 */
export async function beginContentRelease(
  CyberiaContentRelease,
  { releaseId, holder, fields, reset, leaseMs = RELEASE_LEASE_MS },
) {
  const id = assertReleaseId(releaseId);
  const existing = await CyberiaContentRelease.findOne({ releaseId: id }).lean();
  if (existing) {
    if (!sameSource(existing.source, fields.source))
      throw new Error(`Release ${id} was built from another source; give this one a new release id`);
    if (['validated', 'active', 'retired'].includes(existing.status)) return { release: existing, skipped: true };
    if (leaseLive(existing, leaseMs)) throw new Error(`Release ${id} is executing (${existing.lease.holder})`);
  }
  if (reset) await reset(fields.database);
  const acquire = () =>
    CyberiaContentRelease.findOneAndUpdate(
      { releaseId: id },
      {
        $set: {
          ...fields,
          status: 'building',
          failure: { stage: '', message: '', at: null },
          lease: { executing: true, holder, heartbeatAt: new Date() },
        },
        $setOnInsert: { releaseId: id },
      },
      { upsert: true, returnDocument: 'after' },
    ).lean();
  try {
    return { release: await acquire(), skipped: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const executing = await CyberiaContentRelease.findOne({ 'lease.executing': true }).lean();
    if (!executing || leaseLive(executing, leaseMs))
      throw new Error(`Release ${executing?.releaseId ?? '?'} is executing; one release builds at a time`);
    await failContentRelease(CyberiaContentRelease, executing.releaseId, 'lease', 'The execution lease expired');
    return { release: await acquire(), skipped: false };
  }
}

/**
 * Moves an executing release forward: `building` to `candidate`, `candidate` to `validated`.
 * `validated` frees the execution.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {string} releaseId
 * @param {'candidate'|'validated'} status
 * @param {Object} [fields]
 * @returns {Promise<Object>} The release.
 * @throws {Error} When the release is not in the status before `status`.
 * @memberof CyberiaContentRelease
 */
export async function advanceContentRelease(CyberiaContentRelease, releaseId, status, fields = {}) {
  const from = { candidate: 'building', validated: 'candidate' }[status];
  if (!from) throw new Error(`A release does not advance to ${status}`);
  const release = await CyberiaContentRelease.findOneAndUpdate(
    { releaseId, status: from },
    { $set: { ...fields, status }, ...(status === 'validated' ? { $unset: { lease: 1 } } : {}) },
    { returnDocument: 'after' },
  ).lean();
  if (!release) throw new Error(`Release ${releaseId} is not ${from}; it cannot become ${status}`);
  return release;
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
 * Makes a validated release the content a host serves, in one transaction: the active release
 * before it is retired and stays the rollback target, or nothing changes. A production runtime
 * takes a new release only when it is built from an exact source revision; a retired release
 * served this ledger before, so it comes back as it was.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {string} releaseId
 * @param {Object} [params]
 * @param {boolean} [params.production] - Whether this runtime serves production.
 * @returns {Promise<{active:Object,retired:Object|null}>}
 * @throws {Error} When the release does not exist, is not validated, or has no exact source on production.
 * @memberof CyberiaContentRelease
 */
export async function promoteContentRelease(
  CyberiaContentRelease,
  releaseId,
  { production = process.env.NODE_ENV === 'production' } = {},
) {
  const id = assertReleaseId(releaseId);
  const result = await inTransaction(CyberiaContentRelease, async (session) => {
    const release = await CyberiaContentRelease.findOne({ releaseId: id }).session(session).lean();
    if (!release) throw new Error(`Release "${id}" does not exist`);
    if (release.status === 'active') return { active: release, retired: null };
    if (release.status !== 'validated' && release.status !== 'retired')
      throw new Error(`Release "${id}" is ${release.status}; only a validated release can be promoted`);
    if (production && release.status === 'validated' && release.source?.from !== 'source')
      throw new Error(`Release "${id}" has no exact source revision; a production runtime serves only one that has`);
    // The map owners of the release take effect with it, in this transaction.
    await reconcileMapRegistry(await catalogRegistryModels(CyberiaContentRelease.db, release.database), {
      apply: true,
      session,
    });
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
 * Re-promotes the release that was active before the current one, under the same policy.
 * @param {import('mongoose').Model} CyberiaContentRelease
 * @param {Object} [params] - As {@link promoteContentRelease}.
 * @param {string} [params.from] - Roll back only while this release is the active one.
 * @returns {Promise<{active:Object,retired:Object|null}|null>} Null when `from` is not the active release.
 * @memberof CyberiaContentRelease
 */
export async function rollbackContentRelease(CyberiaContentRelease, { from, ...params } = {}) {
  if (from && (await CyberiaContentRelease.active())?.releaseId !== from) return null;
  const previous = await CyberiaContentRelease.previousActive();
  if (!previous) throw new Error('No previous release to roll back to');
  return await promoteContentRelease(CyberiaContentRelease, previous.releaseId, params);
}

/**
 * Retires the active release without a successor: the runtime serves the workspace again, and
 * the release stays the rollback target.
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
  return retired;
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
 * The definitions players own, read from the content databases, else from the Object Layer
 * authority. Read before a prune drops a database, so the renders they name stay.
 * @param {Object} params
 * @param {import('mongoose').Model} params.CyberiaPlayer
 * @param {import('mongoose').Connection} params.connection - A connection on the content server.
 * @param {string[]} params.databases - Every content database, dropped or kept.
 * @param {{host:string,path:string}} params.context - Host context, for the authority.
 * @returns {Promise<Array<{cid:string,data:Object}>>}
 * @throws {Error} When the authority does not answer, so nothing is dropped.
 */
const ownedDefinitions = async ({ CyberiaPlayer, connection, databases, context }) => {
  const missing = new Set(await CyberiaPlayer.ownedDefinitionCids());
  const owned = [];
  for (const database of databases) {
    if (!missing.size) break;
    const ObjectLayer = await MongooseDB.bindModel(connection.useDb(database, { useCache: true }), 'object-layer');
    for (const doc of await ObjectLayer.find({ cid: { $in: [...missing] } }, { cid: 1, 'data.render': 1 }).lean()) {
      owned.push(doc);
      missing.delete(doc.cid);
    }
  }
  for (const cid of missing) {
    const doc = await resolveObjectLayer(cid, context);
    if (doc) owned.push(doc);
  }
  return owned;
};

/**
 * Drops the releases beyond the newest `keep`: their database, then their ledger entry, then the
 * atlas renders no kept release points at, and the IPFS render content and MFS listings no kept
 * store references and no player owns. Never a building, validated or active release, the
 * rollback target, or a release whose execution lease is live. The host prunes the release store.
 * @param {Object} params
 * @param {import('mongoose').Model} params.CyberiaContentRelease
 * @param {import('mongoose').Model} [params.CyberiaPlayer] - Needed with `context`: the profiles whose definitions stay.
 * @param {import('mongoose').Connection} params.connection - A connection on the content server.
 * @param {{host:string,path:string}} [params.context] - Host context; when given, orphaned atlas renders and IPFS content are removed.
 * @param {string} [params.baseDatabase] - The partition's base database, kept like a release.
 * @param {number} [params.keep=2] - Releases to keep beyond the protected ones, newest first.
 * @returns {Promise<string[]>} The release ids removed.
 * @memberof CyberiaContentRelease
 */
export async function pruneContentReleases({
  CyberiaContentRelease,
  CyberiaPlayer,
  connection,
  context,
  baseDatabase = '',
  keep = 2,
}) {
  if (context && !CyberiaPlayer) throw new Error('A content prune needs the player profiles to keep what they own');
  const rollbackTarget = await CyberiaContentRelease.previousActive();
  const removable = (
    await CyberiaContentRelease.find({ status: { $nin: ['building', 'validated', 'active'] } })
      .sort({ retiredAt: -1, updatedAt: -1 })
      .lean()
  )
    .filter((release) => release.releaseId !== rollbackTarget?.releaseId && !leaseLive(release, RELEASE_LEASE_MS))
    .slice(Math.max(0, keep));
  /** The base database and the database of every release the ledger holds. */
  const contentDatabases = async () => [
    ...new Set(
      [
        baseDatabase,
        ...(await CyberiaContentRelease.find({}, { database: 1 }).lean()).map(({ database }) => database),
      ].filter(Boolean),
    ),
  ];
  const owned = context
    ? await ownedDefinitions({ CyberiaPlayer, connection, context, databases: await contentDatabases() })
    : [];
  const removed = [];
  for (const release of removable) {
    if (release.database) await connection.useDb(release.database, { useCache: true }).dropDatabase();
    await CyberiaContentRelease.deleteOne({ releaseId: release.releaseId });
    removed.push(release.releaseId);
  }
  if (removed.length) logger.info(`Content releases pruned: ${removed.join(', ')}`);
  if (context) {
    const owners = [];
    const stores = [];
    for (const database of await contentDatabases()) {
      const store = connection.useDb(database, { useCache: true });
      owners.push(await MongooseDB.bindModel(store, 'atlas-sprite-sheet'));
      stores.push({
        ObjectLayer: await MongooseDB.bindModel(store, 'object-layer'),
        Ipfs: await MongooseDB.bindModel(store, 'ipfs'),
      });
    }
    await AtlasSpriteSheetStore.pruneOrphanRenders({ options: context, owners });
    const content = await pruneUnreferencedContent({ stores, owned });
    logger.info('IPFS render content no kept store references pruned', content);
  }
  return removed;
}

/**
 * The content database the runtime of a host serves: the active release's, else the workspace.
 * @param {{host:string,path:string}} context - A context whose models hold the release ledger.
 * @param {string} workspace - The workspace database name.
 * @returns {Promise<{releaseId:string,database:string}>}
 * @memberof CyberiaContentRelease
 */
export async function servedContent(context, workspace) {
  const active = await DataBaseProviderService.getProvider(context, 'mongoose').models.CyberiaContentRelease.active();
  return {
    releaseId: active?.releaseId ?? '',
    database: active?.database ?? workspace,
    digest: active?.content?.digest ?? '',
  };
}

/**
 * Makes the content partition of a running host serve its active release to every reader, and the
 * process read the content artifact that release holds. With no promotion yet, it serves the
 * workspace and the artifact on disk. An artifact that failed to load is loaded again on each call.
 * @param {{host:string,path:string}} context
 * @returns {Promise<{releaseId:string,database:string,changed:boolean,artifact:{releaseId:string,error:string}}|null>}
 *   `changed` when the served database or the state of its artifact changed. Null when the host has
 *   no content partition.
 * @memberof CyberiaContentRelease
 */
export async function activateContentRelease(context) {
  const bucket = DataBaseProviderService.getProvider(context, 'mongoose');
  if (!bucket.partitions?.[CONTENT_PARTITION] || !bucket.models.CyberiaContentRelease) return null;
  const served = await servedContent(context, bucket.partitions[CONTENT_PARTITION].name);
  const before = servedContentArtifact();
  const artifact = await serveContentArtifact({
    releaseId: served.releaseId,
    digest: served.digest,
    db: served.releaseId ? bucket.connection.getClient().db(served.database) : undefined,
  });
  const { previous, database } = await DataBaseProviderService.serveDatabase(
    context,
    CONTENT_PARTITION,
    served.database,
  );
  const changed = previous !== database || before.releaseId !== artifact.releaseId || before.error !== artifact.error;
  return { releaseId: served.releaseId, database, changed, artifact };
}

/**
 * Asks the live game servers to rebuild from the content now served: their whole world, or only
 * their object layers with `incremental`. One trigger per logical endpoint, which reaches one
 * replica; the other replicas follow with their reload loop.
 * @param {{host:string,path:string}} context
 * @param {{mode?:'full'|'incremental', instanceCode?: string}} [params] - `instanceCode` names one world.
 * @returns {Promise<{instanceCode:string, url:string, transport?:string, message?:string, error?:string}[]>}
 * @memberof CyberiaContentRelease
 */
export async function reloadContentServers(context, { mode = 'full', instanceCode } = {}) {
  if (!DataBaseProviderService.getProvider(context, 'mongoose').models.CyberiaServerRegistry) return [];
  const endpoints = await liveEndpoints(context, instanceCode ? { instanceCodes: [instanceCode] } : {});
  const results = [];
  for (const endpoint of endpoints) {
    const target = { instanceCode: endpoint.instanceCode, url: endpoint.url };
    try {
      const { transport, result } = await triggerHotReload({
        serverUrl: endpoint.url,
        instanceCode: endpoint.instanceCode,
        mode,
      });
      results.push({ ...target, transport, message: result?.message ?? '' });
    } catch (error) {
      logger.warn(`Hot reload of ${endpoint.url} failed: ${error.message}`);
      results.push({ ...target, error: error.message });
    }
  }
  return results;
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
        if (result.artifact.error) logger.warn(result.artifact.error);
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
