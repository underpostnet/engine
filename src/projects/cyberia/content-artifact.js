/**
 * The engine side of the Cyberia content artifact.
 *
 * The artifact is data: `dist/manifest.json` and the files it lists, built by `cyberia-content`.
 * Its root is a `cyberia-content` source checkout, or a packed artifact of the same layout. The root
 * is resolved only when a content operation asks for it, so every other operation runs without it.
 * A release database holds a copy of the files a running engine reads, and an engine that serves
 * the release reads that copy. The artifact is the only content source: a missing, altered or
 * unsupported artifact fails, and nothing falls back. This module also imports the compiled
 * document families into the operational models and audits serialized content against the artifact.
 *
 * @module src/projects/cyberia/content-artifact.js
 * @namespace CyberiaContentArtifact
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { objectLayerIdentity } from '../../api/object-layer/object-layer.identity.js';
import {
  collectInstanceItemIds,
  collectSummonedItemIds,
  isMaterialItemId,
} from '../../api/cyberia-instance/cyberia-instance-items.js';
import { STAT_TYPES } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import {
  composeItemDefinition,
  findAllBoundDefinitions,
  findBoundDefinition,
  writeItemDefinition,
} from './object-layer-catalog.js';

/** The artifact layout and document shapes this engine reads. */
export const CONTENT_SCHEMA_VERSION = 4;

/**
 * The document families of the artifact by file name, in import order: a family names only what
 * an earlier one holds. The foundation and each saga carry one file per family.
 * @memberof CyberiaContentArtifact
 */
export const CONTENT_FAMILIES = Object.freeze({
  objectLayers: 'object-layers',
  entityTypeDefaults: 'entity-type-defaults',
  skills: 'skills',
  maps: 'maps',
  quests: 'quests',
  dialogues: 'dialogues',
  actions: 'actions',
});

const ENGINE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A checkout the engine works with: the path its variable names, or the one nested in the engine. */
const checkoutRoot = (variable, name) => path.resolve(process.env[variable] || path.join(ENGINE_ROOT, name));

/**
 * The content artifact root: `CYBERIA_CONTENT_ROOT`, or the nested `cyberia-content` checkout.
 * @memberof CyberiaContentArtifact
 */
export const contentRoot = () => checkoutRoot('CYBERIA_CONTENT_ROOT', 'cyberia-content');

/**
 * The deployment checkout: `CYBERIA_DEPLOYMENT_ROOT`, or the nested `cyberia-deployment` checkout.
 * @memberof CyberiaContentArtifact
 */
export const deploymentRoot = () => checkoutRoot('CYBERIA_DEPLOYMENT_ROOT', 'cyberia-deployment');

/**
 * Whether the content root is a source checkout. A packed artifact has no sources.
 * @returns {boolean}
 * @memberof CyberiaContentArtifact
 */
export const hasContentSources = () => fs.existsSync(path.join(contentRoot(), 'src'));

/**
 * The sources of the content root: where an export and the runtime contract land. A packed
 * artifact is never written to.
 * @returns {string}
 * @throws {Error} When the content root is not a source checkout.
 * @memberof CyberiaContentArtifact
 */
export function contentSources() {
  if (!hasContentSources()) throw new Error(`${contentRoot()} is not a cyberia-content source checkout`);
  return path.join(contentRoot(), 'src');
}

/**
 * Whether the content root holds a built artifact. Callers that only run in a full workspace skip
 * without one, as they do without the other sibling checkouts.
 * @returns {boolean}
 * @memberof CyberiaContentArtifact
 */
export const hasContentArtifact = () => fs.existsSync(path.join(contentRoot(), 'dist', 'manifest.json'));

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

const sha256 = (data) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;

/** The content digest: the sha256 of one `<path> <digest>` line per file, in path order. */
const contentDigest = (files) =>
  sha256(
    Object.keys(files)
      .sort()
      .map((file) => `${file} ${files[file]}\n`)
      .join(''),
  );

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCodeList = (value) => Array.isArray(value) && value.every((code) => typeof code === 'string' && code);

/**
 * The collection in which a release database holds its content artifact.
 * @memberof CyberiaContentArtifact
 */
export const RELEASE_ARTIFACT_COLLECTION = 'cyberia-content-artifact';

const MANIFEST_FILE = 'manifest.json';

/** The files a running engine reads: every file but the instance backups, which only an import reads. */
const runtimeFiles = (manifest) =>
  Object.keys(manifest.files)
    .filter((file) => !file.startsWith('instances/'))
    .sort();

/** The reason a manifest is invalid, or '' when it is valid. */
function manifestDefect(manifest) {
  if (!isPlainObject(manifest)) return 'the manifest is not an object';
  if (typeof manifest.repository !== 'string' || !manifest.repository) return 'repository is missing';
  if (!REVISION_PATTERN.test(manifest.sourceRevision ?? '')) return 'sourceRevision is not a commit id';
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) return 'schemaVersion is missing';
  if (!DIGEST_PATTERN.test(manifest.contentDigest ?? '')) return 'contentDigest is not a sha256 digest';
  if (!isPlainObject(manifest.build)) return 'build is missing';
  if (!isCodeList(manifest.instances) || !isCodeList(manifest.sagas)) return 'instances and sagas must be code lists';
  if (!isPlainObject(manifest.files) || !Object.values(manifest.files).every((digest) => DIGEST_PATTERN.test(digest)))
    return 'files must map each artifact path to a sha256 digest';
  return '';
}

/** Parses and checks a manifest: its fields, its version, its schema and its content digest. */
function verifiedManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid content artifact: ${error.message}`);
  }
  if (!VERSION_PATTERN.test(manifest?.contentVersion ?? ''))
    throw new Error('The content artifact names no content version');
  const defect = manifestDefect(manifest);
  if (defect) throw new Error(`Invalid content artifact: ${defect}`);
  if (manifest.schemaVersion !== CONTENT_SCHEMA_VERSION)
    throw new Error(
      `Content artifact schema ${manifest.schemaVersion} is not supported; this engine reads ${CONTENT_SCHEMA_VERSION}`,
    );
  if (contentDigest(manifest.files) !== manifest.contentDigest)
    throw new Error('Content digest mismatch: the file list does not match contentDigest');
  return manifest;
}

/** An opened artifact over the bytes of its files: every read checks the digest of the file it returns. */
function artifactReader(manifest, bytesOf, instanceDir) {
  const read = (file) => {
    const expected = manifest.files[file];
    if (!expected) throw new Error(`The content artifact holds no ${file}`);
    const data = bytesOf(file);
    if (!data) throw new Error(`Invalid content artifact: ${file} is missing`);
    if (sha256(data) !== expected) throw new Error(`Content digest mismatch: ${file}`);
    return data;
  };
  return {
    manifest,
    read,
    json: (file) => JSON.parse(read(file).toString('utf8')),
    instanceDir(code) {
      if (!manifest.instances.includes(code)) throw new Error(`The content artifact holds no instance ${code}`);
      return instanceDir(code, read);
    },
  };
}

/**
 * Opens and verifies the artifact of a content root. Open checks the manifest, the schema and the
 * content digest; every read checks the digest of the file it returns.
 * @param {string} [root] - {@link contentRoot} by default.
 * @returns {{manifest:Object, read:(file:string)=>Buffer, json:(file:string)=>any, instanceDir:(code:string)=>string}}
 * @throws {Error} When the artifact is missing, invalid, unversioned, unsupported or altered.
 * @memberof CyberiaContentArtifact
 */
export function openContentArtifact(root = contentRoot()) {
  const dist = path.join(root, 'dist');
  const manifestFile = path.join(dist, MANIFEST_FILE);
  if (!fs.existsSync(manifestFile))
    throw new Error(`No content artifact at ${dist}: build it in cyberia-content, or set CYBERIA_CONTENT_ROOT`);
  const manifest = verifiedManifest(fs.readFileSync(manifestFile, 'utf8'));
  const target = (file) => path.join(dist, file);
  return artifactReader(
    manifest,
    (file) => (fs.existsSync(target(file)) ? fs.readFileSync(target(file)) : null),
    (code, read) => {
      const prefix = `instances/${code}/`;
      for (const file of Object.keys(manifest.files).filter((name) => name.startsWith(prefix))) read(file);
      return path.join(dist, 'instances', code);
    },
  );
}

/**
 * Stores the files a running engine reads in a release database: the manifest and every file but
 * the instance backups, one document per file. Replaces what the database held.
 * @param {import('mongodb').Db} db - The release database.
 * @param {Object} opened - {@link openContentArtifact} output.
 * @returns {Promise<number>} The files stored, the manifest included.
 * @memberof CyberiaContentArtifact
 */
export async function storeContentArtifact(db, opened) {
  const documents = [
    { _id: MANIFEST_FILE, data: JSON.stringify(opened.manifest) },
    ...runtimeFiles(opened.manifest).map((file) => ({ _id: file, data: opened.read(file).toString('utf8') })),
  ];
  const collection = db.collection(RELEASE_ARTIFACT_COLLECTION);
  await collection.deleteMany({});
  await collection.insertMany(documents);
  return documents.length;
}

/**
 * Opens the content artifact a release database holds. It is verified as the artifact on disk is,
 * every file at once, and it must be the content the release records. It holds no instance backups.
 * @param {import('mongodb').Db} db - The release database.
 * @param {string} digest - The content digest the release records.
 * @returns {Promise<Object>} An opened artifact, as {@link openContentArtifact} returns one, and
 *   `files`: the stored files it verified.
 * @throws {Error} When the database holds no artifact, another artifact, or an incomplete or altered one.
 * @memberof CyberiaContentArtifact
 */
export async function loadContentArtifact(db, digest) {
  const stored = new Map(
    (await db.collection(RELEASE_ARTIFACT_COLLECTION).find({}).toArray()).map(({ _id, data }) => [_id, data]),
  );
  if (!stored.has(MANIFEST_FILE)) throw new Error(`No content artifact in ${db.databaseName}`);
  const manifest = verifiedManifest(stored.get(MANIFEST_FILE));
  if (manifest.contentDigest !== digest)
    throw new Error(
      `${db.databaseName} holds content ${manifest.contentDigest}; the release records ${digest || 'no content'}`,
    );
  const opened = artifactReader(
    manifest,
    (file) => (stored.has(file) ? Buffer.from(stored.get(file), 'utf8') : null),
    (code) => {
      throw new Error(`A release database holds no instance backup: import ${code} from the content artifact`);
    },
  );
  const files = runtimeFiles(manifest);
  for (const file of files) opened.read(file);
  return { ...opened, files };
}

let workspaceArtifact;
let served = null;

/** Freezes a value and everything it holds: the runtime data one process shares stays as the artifact holds it. */
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
};

/** One document list per {@link CONTENT_FAMILIES} key, read from a directory of the artifact. */
const readFamilies = (opened, directory) =>
  Object.fromEntries(
    Object.entries(CONTENT_FAMILIES).map(([family, file]) => [family, opened.json(`${directory}/${file}.json`)]),
  );

/** The runtime data of an opened artifact. Its foundation is deeply frozen. */
function runtimeArtifact(opened) {
  const foundation = deepFreeze(readFamilies(opened, 'foundation'));
  return Object.freeze({
    manifest: deepFreeze(opened.manifest),
    foundation,
    baseline: deepFreeze(opened.json('foundation/baseline.json')),
    byItemId: new Map(foundation.objectLayers.map((item) => [item.itemId, item])),
    context: deepFreeze(opened.json('context.json')),
    saga(code) {
      if (!opened.manifest.sagas.includes(code)) throw new Error(`The content artifact holds no saga ${code}`);
      return {
        saga: opened.json(`sagas/${code}/saga.json`),
        instance: opened.json(`sagas/${code}/instance.json`),
        families: readFamilies(opened, `sagas/${code}`),
      };
    },
    instanceDir: opened.instanceDir,
  });
}

/**
 * The verified content artifact of the content this process serves: the copy the served release
 * holds ({@link serveContentArtifact}), else the artifact on disk, opened once per process.
 * @returns {{manifest:Object, foundation:Object<string,Object[]>, baseline:ReadonlyArray<Object>,
 *   byItemId:Map<string,Object>, context:Object, saga:(code:string)=>{saga:Object, instance:Object,
 *   families:Object<string,Object[]>}, instanceDir:(code:string)=>string}} `baseline` holds the entity-type
 *   defaults every world resolves against; `context` is the index of every definition and its references.
 * @throws {Error} When the artifact is missing, invalid, altered or of an unsupported schema.
 * @memberof CyberiaContentArtifact
 */
export function contentArtifact() {
  if (served?.error) throw served.error;
  if (served) return served.artifact;
  return (workspaceArtifact ??= runtimeArtifact(openContentArtifact()));
}

/**
 * Makes this process read the artifact of the content it serves: the copy a release database
 * holds, or the artifact on disk while the workspace serves. A copy that fails to load fails every
 * read until a later call loads it.
 * @param {Object} [params]
 * @param {string} [params.releaseId] - The served release; empty while the workspace serves.
 * @param {import('mongodb').Db} [params.db] - The database of the release.
 * @param {string} [params.digest] - The content digest the release records.
 * @returns {Promise<{releaseId:string, error:string}>} {@link servedContentArtifact} after the call.
 * @memberof CyberiaContentArtifact
 */
export async function serveContentArtifact({ releaseId = '', db, digest = '' } = {}) {
  if ((served?.releaseId ?? '') === releaseId && !served?.error) return servedContentArtifact();
  if (!releaseId) served = null;
  else
    try {
      served = { releaseId, artifact: runtimeArtifact(await loadContentArtifact(db, digest)) };
    } catch (error) {
      served = { releaseId, error: new Error(`Content release ${releaseId}: ${error.message}`) };
    }
  return servedContentArtifact();
}

/**
 * The release whose artifact this process reads, and why it cannot, if it cannot.
 * @returns {{releaseId:string, error:string}} An empty release id while the workspace serves.
 * @memberof CyberiaContentArtifact
 */
export const servedContentArtifact = () => ({
  releaseId: served?.releaseId ?? '',
  error: served?.error?.message ?? '',
});

/**
 * The source lock entry of an artifact: its repository, its source revision and its identity.
 * @param {Object} manifest - Artifact manifest.
 * @returns {{repository:string, revision:string, artifact:{version:string, digest:string}}}
 * @memberof CyberiaContentArtifact
 */
export const contentLockEntry = ({ repository, sourceRevision, contentVersion, contentDigest }) => ({
  repository,
  revision: sourceRevision,
  artifact: { version: contentVersion, digest: contentDigest },
});

/** What a new label starts with: no render until an artist draws it. */
const RENDERLESS = Object.freeze({ data: { render: {} } });

const ITEM_FIELDS = ['type', 'description', 'activable'];

/** The content fields a composed definition changes against the bound one. */
function changedFields(bound, next) {
  const fields = ITEM_FIELDS.filter((field) => bound.data?.item?.[field] !== next.data.item[field]).map(
    (field) => `item.${field}`,
  );
  for (const key of STAT_TYPES)
    if ((bound.data?.stats?.[key] ?? 0) !== next.data.stats[key]) fields.push(`stats.${key}`);
  if (bound.profile?.id !== next.profile.id || bound.profile?.version !== next.profile.version) fields.push('profile');
  return fields;
}

/**
 * How one artifact item stands against the definition its label is bound to.
 * @param {{id:string, itemId:string, payload:Object}} item - An artifact Object Layer item.
 * @param {Object|null} bound - Plain bound Object Layer document, or null.
 * @returns {{id:string,itemId:string,status:'absent'|'in-sync'|'differs',cid:string,boundCid:string,fields:string[]}}
 * @memberof CyberiaContentArtifact
 */
export function planObjectLayer(item, bound) {
  const next = composeItemDefinition({
    boundData: bound?.data ?? null,
    payload: item.payload,
    setOnInsert: RENDERLESS,
  });
  const { cid } = objectLayerIdentity(next);
  const entry = { id: item.id, itemId: item.itemId, cid, boundCid: bound?.cid ?? '', fields: [] };
  if (!bound) return { ...entry, status: 'absent' };
  if (bound.cid === cid) return { ...entry, status: 'in-sync' };
  return { ...entry, status: 'differs', fields: changedFields(bound, next) };
}

/**
 * The plan of artifact items against a deployment's catalog: each composed definition against the
 * definition its label is bound to. The plan compares identities, never item ids.
 * @param {Object} params
 * @param {Object[]} params.items - Artifact Object Layer items.
 * @param {import('./object-layer-catalog.js').CatalogModels} params.models
 * @returns {Promise<Object[]>} {@link planObjectLayer} entries, in item order.
 * @memberof CyberiaContentArtifact
 */
export async function planMaterialization({ items, models }) {
  const plan = [];
  for (const item of items) {
    const bound = await findBoundDefinition(models, item.itemId);
    plan.push(planObjectLayer(item, bound ? bound.toObject({ virtuals: false }) : null));
  }
  return plan;
}

/**
 * Writes what a plan calls for: every absent label, and every differing one when `rebind` is set.
 * A stored definition never changes: a rebind publishes a new one and moves the label, and the
 * previous definition stays. Idempotent.
 * @param {Object} params
 * @param {Object[]} params.plan - {@link planMaterialization} output.
 * @param {Object[]} params.items - The planned artifact items.
 * @param {import('./object-layer-catalog.js').CatalogModels} params.models
 * @param {Object} [params.options] - Router options of this host.
 * @param {boolean} [params.rebind=false]
 * @returns {Promise<Object[]>} The written entries, with the cid the label is bound to now.
 * @memberof CyberiaContentArtifact
 */
export async function materializeObjectLayers({ plan, items, models, options, rebind = false }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const written = [];
  for (const entry of plan) {
    if (entry.status === 'in-sync' || (entry.status === 'differs' && !rebind)) continue;
    const definition = await writeItemDefinition({
      models,
      payload: byId.get(entry.id).payload,
      setOnInsert: RENDERLESS,
      options,
    });
    written.push({ ...entry, cid: definition.cid });
  }
  return written;
}

/** Whether a stored document holds every value a compiled one holds. What else it stores never counts. */
export const holdsContent = (stored, expected) => {
  if (Array.isArray(expected))
    return (
      Array.isArray(stored) &&
      stored.length === expected.length &&
      expected.every((entry, index) => holdsContent(stored[index], entry))
    );
  if (expected !== null && typeof expected === 'object')
    return (
      stored !== null &&
      typeof stored === 'object' &&
      Object.keys(expected).every((key) => holdsContent(stored[key], expected[key]))
    );
  return (stored ?? null) === (expected ?? null);
};

/**
 * The natural key of an entity-type default: its entity type and its live items.
 * @param {{entityType:string, liveItemIds:string[]}} doc
 * @returns {{entityType:string, liveItemIds:string[]}}
 * @memberof CyberiaContentArtifact
 */
export const entityTypeDefaultKey = ({ entityType, liveItemIds }) => ({ entityType, liveItemIds });

/** Placement fields of a quest or an action: Studio sets them, and an import writes them only on insert. */
const PLACEMENT_FIELDS = Object.freeze(['sourceMapCode', 'sourceCellX', 'sourceCellY']);

const withoutPlacement = (doc) =>
  Object.fromEntries(Object.entries(doc).filter(([key]) => !PLACEMENT_FIELDS.includes(key)));

/**
 * How a family is stored: its model, the natural key of a compiled document, the content an
 * import compares and writes, and whether a write counts a revision. A dialogue document is every
 * line of one code. A compiled map has no entities: Studio places them, and an import never writes them.
 */
const FAMILY_STORES = Object.freeze({
  entityTypeDefaults: { model: 'CyberiaEntityTypeDefault', key: entityTypeDefaultKey },
  skills: { model: 'CyberiaSkill', key: ({ triggerItemId }) => ({ triggerItemId }) },
  maps: { model: 'CyberiaMap', key: ({ code }) => ({ code }), revised: true },
  quests: { model: 'CyberiaQuest', key: ({ code }) => ({ code }), content: withoutPlacement },
  dialogues: { model: 'CyberiaDialogue', key: ([{ code }]) => ({ code }) },
  actions: { model: 'CyberiaAction', key: ({ code }) => ({ code }), content: withoutPlacement },
});

/** The documents of a family as the store keeps them: dialogue lines grouped by code. */
const documentsOf = (family, documents) =>
  family === 'dialogues' ? [...Map.groupBy(documents, ({ code }) => code).values()] : documents;

const catalogOf = ({ ObjectLayer, CyberiaItemCatalog }) => ({ ObjectLayer, CyberiaItemCatalog });

const findStored = (Model, family, key) =>
  family === 'dialogues' ? Model.find(key).sort({ order: 1 }).lean() : Model.findOne(key).lean();

/**
 * The plan of compiled families against a store. A document or an Object Layer item is absent,
 * in sync, or differs.
 * @param {Object} params
 * @param {Object<string,Object[]>} params.families - Compiled families, as {@link contentArtifact} reads them.
 * @param {Object} params.models - The content models and the catalog models.
 * @returns {Promise<{objectLayers:Object[], documents:Object<string,Array<{doc:Object, status:string}>>}>}
 * @memberof CyberiaContentArtifact
 */
export async function planContent({ families, models }) {
  const documents = {};
  for (const [family, { model, key, content = (doc) => doc }] of Object.entries(FAMILY_STORES)) {
    documents[family] = [];
    for (const doc of documentsOf(family, families[family])) {
      const stored = await findStored(models[model], family, key(doc));
      const found = Array.isArray(stored) ? stored.length > 0 : !!stored;
      const status = !found ? 'absent' : holdsContent(stored, content(doc)) ? 'in-sync' : 'differs';
      documents[family].push({ doc, status });
    }
  }
  return {
    objectLayers: await planMaterialization({ items: families.objectLayers, models: catalogOf(models) }),
    documents,
  };
}

/**
 * Imports compiled families in dependency order: Object Layer items and their catalog bindings,
 * entity-type defaults, skills, maps, quests, dialogues, then actions. It inserts what is absent,
 * and with `rebind` moves differing labels and documents to the artifact. Studio's work stays: an
 * item keeps its render, a quest or action its source, and a map its entities. Idempotent.
 * @param {Object} params
 * @param {Object<string,Object[]>} params.families - Compiled families.
 * @param {Object} params.models - The content models and the catalog models.
 * @param {{host:string,path:string}} [params.context] - Host the models belong to.
 * @param {boolean} [params.rebind=false] - Move differing labels and documents to the artifact.
 * @returns {Promise<{plan:Object, objectLayers:number, written:Object<string,number>, entityTypeDefaultIds:Array}>}
 *   The plan, the Object Layer definitions written, the documents written per family, and the id of
 *   each entity-type default in compiled order.
 * @memberof CyberiaContentArtifact
 */
export async function importContent({ families, models, context, rebind = false }) {
  const plan = await planContent({ families, models });
  const objectLayers = await materializeObjectLayers({
    plan: plan.objectLayers,
    items: families.objectLayers,
    models: catalogOf(models),
    options: context,
    rebind,
  });
  const written = {};
  for (const [family, { model, key, content = (doc) => doc, revised }] of Object.entries(FAMILY_STORES)) {
    const Model = models[model];
    written[family] = 0;
    for (const { doc, status } of plan.documents[family]) {
      if (status === 'in-sync' || (status === 'differs' && !rebind)) continue;
      if (family === 'dialogues') {
        await Model.deleteMany(key(doc));
        await Model.insertMany(doc);
      } else if (status === 'absent') await Model.create(doc);
      else await Model.updateOne(key(doc), { $set: content(doc), ...(revised ? { $inc: { revision: 1 } } : {}) });
      written[family]++;
    }
  }
  const entityTypeDefaultIds = [];
  for (const row of families.entityTypeDefaults)
    entityTypeDefaultIds.push(
      (await models.CyberiaEntityTypeDefault.findOne(FAMILY_STORES.entityTypeDefaults.key(row), { _id: 1 }).lean())._id,
    );
  return { plan, objectLayers: objectLayers.length, written, entityTypeDefaultIds };
}

/**
 * Imports a compiled saga: its families, its CyberiaSaga record, and its instance. The instance
 * conf references the entity-type defaults of every entity the saga places. The instance portal
 * graph is spatial authoring's, so only an insert writes it.
 * @param {Object} params
 * @param {Object} params.saga - `contentArtifact().saga(code)`.
 * @param {Object} params.models - The content models, `CyberiaSaga`, `CyberiaInstance`, `CyberiaInstanceConf`
 *   and the catalog models.
 * @param {{host:string,path:string}} [params.context] - Host the models belong to.
 * @param {boolean} [params.rebind=false] - Move differing labels and documents to the artifact.
 * @returns {Promise<Object>} {@link importContent} output.
 * @memberof CyberiaContentArtifact
 */
export async function importSaga({ saga: { saga, instance, families }, models, context, rebind = false }) {
  const result = await importContent({ families, models, context, rebind });
  await models.CyberiaSaga.findOneAndUpdate({ code: saga.code }, { $set: saga }, { upsert: true });
  const conf = await models.CyberiaInstanceConf.findOneAndUpdate(
    { instanceCode: instance.code },
    { $addToSet: { entityDefaults: { $each: result.entityTypeDefaultIds } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await models.CyberiaInstance.findOneAndUpdate(
    { code: instance.code },
    {
      $set: {
        name: instance.name,
        description: instance.description,
        tags: instance.tags,
        cyberiaMapCodes: instance.cyberiaMapCodes,
        topologyMode: instance.topologyMode,
      },
      $setOnInsert: { code: instance.code, portals: instance.portals, conf: conf._id },
    },
    { upsert: true },
  );
  return result;
}

/** Collections an audit reads, with the backup directory each one is exported to. */
const BACKUP_DIRECTORIES = Object.freeze({
  objectLayers: 'object-layers',
  entityDefaults: 'cyberia-entity-type-defaults',
  skills: 'cyberia-skills',
  maps: 'maps',
  actions: 'cyberia-actions',
  quests: 'cyberia-quests',
  dialogues: 'cyberia-dialogues',
  sagas: 'cyberia-sagas',
});

/**
 * The content of one instance backup directory.
 * @param {string} backupDir
 * @returns {Object} Content shape: one array per collection, plus `source`.
 * @memberof CyberiaContentArtifact
 */
export function readBackupContent(backupDir) {
  const content = { source: `backup ${path.basename(path.resolve(backupDir))}` };
  for (const [collection, directory] of Object.entries(BACKUP_DIRECTORIES)) {
    const dir = path.join(backupDir, directory);
    content[collection] = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => file.endsWith('.json'))
          .sort()
          .flatMap((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
      : [];
  }
  return content;
}

/**
 * The content of a live database: the definitions the catalog binds, and every content collection.
 * @param {Object} models
 * @returns {Promise<Object>} Content shape.
 * @memberof CyberiaContentArtifact
 */
export async function readDatabaseContent(models) {
  const all = (Model, projection = {}) => Model.find({}, projection).lean();
  return {
    source: 'database',
    objectLayers: await findAllBoundDefinitions(models),
    entityDefaults: await all(models.CyberiaEntityTypeDefault),
    skills: await all(models.CyberiaSkill),
    maps: await all(models.CyberiaMap, { code: 1, 'entities.objectLayerItemIds': 1 }),
    actions: await all(models.CyberiaAction),
    quests: await all(models.CyberiaQuest),
    dialogues: await all(models.CyberiaDialogue),
    sagas: await all(models.CyberiaSaga),
  };
}

/**
 * Every label the content names or stores, classified — foundation, generated by a saga, or
 * unresolved — and every stored skill against the artifact skills.
 * @param {Object} params
 * @param {Object} params.content - {@link readBackupContent} or {@link readDatabaseContent} output.
 * @param {Object} [params.artifact] - {@link contentArtifact} by default.
 * @returns {{source:string, inspected:Object, foundation:Object[], generated:Object[], unresolved:Object[], skills:Object[]}}
 * @memberof CyberiaContentArtifact
 */
export function auditContent({ content, artifact: { byItemId, foundation } = contentArtifact() }) {
  const stored = new Map(content.objectLayers.map((doc) => [doc?.data?.item?.id, doc]));
  const generated = new Map();
  for (const saga of content.sagas)
    for (const { id, objectLayer } of saga.definitions ?? [])
      if (objectLayer) generated.set(id.slice(id.indexOf('.') + 1), saga.code);

  const named = collectInstanceItemIds(content);
  for (const skill of content.skills) if (isMaterialItemId(skill.triggerItemId)) named.add(skill.triggerItemId);
  for (const itemId of collectSummonedItemIds(content.skills)) named.add(itemId);

  const report = {
    source: content.source,
    inspected: Object.fromEntries(
      Object.keys(BACKUP_DIRECTORIES).map((collection) => [collection, content[collection].length]),
    ),
    foundation: [],
    generated: [],
    unresolved: [],
    skills: [],
  };
  for (const itemId of [...new Set([...named, ...stored.keys()])].filter(Boolean).sort()) {
    const item = byItemId.get(itemId);
    if (item) report.foundation.push(planObjectLayer(item, stored.get(itemId) ?? null));
    else if (generated.has(itemId)) report.generated.push({ itemId, saga: generated.get(itemId) });
    else report.unresolved.push({ itemId, stored: stored.has(itemId), named: named.has(itemId) });
  }

  const compiled = new Map(foundation.skills.map((skill) => [skill.triggerItemId, skill]));
  for (const skill of content.skills) {
    const expected = compiled.get(skill.triggerItemId);
    report.skills.push({
      triggerItemId: skill.triggerItemId,
      status: !expected ? 'not-foundation' : holdsContent(skill, expected) ? 'in-sync' : 'differs',
    });
  }
  return report;
}
