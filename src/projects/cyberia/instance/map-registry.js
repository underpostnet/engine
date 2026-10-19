/**
 * Map ownership: the instance of a catalog that owns each map code. A catalog is one content
 * database, the workspace or a release, and its maps and instances are the canonical source. The
 * registry is their projection: one row per map code an instance lists. Every catalog write
 * updates it in the same transaction; a reconciliation repairs it. A map code of a catalog has one
 * owner at most. A row outlives its owner as `deprecated`, and a new owner of the code takes it.
 *
 * @module src/projects/cyberia/instance/map-registry.js
 * @namespace CyberiaMapRegistry
 */
import crypto from 'node:crypto';
import { MongooseDB } from '../../../db/mongo/MongooseDB.js';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { mapSpatialDefect, worldPlacementDefects } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { REGISTRY_STATUSES } from '../../../api/cyberia-global-map-code-registry/cyberia-global-map-code-registry.model.js';

const logger = loggerFactory(import.meta);

/** The most maps, instances or rows one reconciliation reads. */
export const REGISTRY_LIMIT = 4096;

/** The statuses a navigation resolves: every one but `deprecated`. */
const NAVIGABLE = new Set(REGISTRY_STATUSES.filter((status) => status !== 'deprecated'));

/** The models a registry write reads and writes. */
const REGISTRY_MODELS = Object.freeze(['CyberiaMap', 'CyberiaInstance', 'CyberiaGlobalMapCodeRegistry']);

/** The defects one error names; the report holds every defect. */
const DEFECTS_SHOWN = 10;

const failure = (message) => Object.assign(new Error(message), { status: 409 });

const defectsError = (defects) =>
  failure(
    defects.slice(0, DEFECTS_SHOWN).join('; ') +
      (defects.length > DEFECTS_SHOWN ? `; and ${defects.length - DEFECTS_SHOWN} more` : ''),
  );

/**
 * The registry status of a map and of the instance that lists it.
 * @param {string} [mapStatus]
 * @param {string} [instanceStatus]
 * @returns {string}
 * @memberof CyberiaMapRegistry
 */
export const registryStatus = (mapStatus, instanceStatus) =>
  [mapStatus, instanceStatus].includes('archived')
    ? 'deprecated'
    : mapStatus === 'published' && instanceStatus === 'published'
      ? 'active'
      : 'unlisted';

/**
 * The checksum of what a row asserts: its catalog, code, owner and status.
 * @param {{catalog: string, mapCode: string, instanceCode: string, instanceId: *, status: string}} row
 * @returns {string}
 * @memberof CyberiaMapRegistry
 */
export const registryChecksum = ({ catalog, mapCode, instanceCode, instanceId, status }) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([catalog, mapCode, instanceCode, String(instanceId), status]))
    .digest('hex');

const rowOf = (catalog, mapCode, instance, status) => {
  const row = { catalog, mapCode, instanceCode: instance.instanceCode, instanceId: instance.instanceId, status };
  return { ...row, checksum: registryChecksum(row) };
};

/**
 * Every defect of a catalog the registry refuses: an invalid or repeated map code, an invalid world
 * origin, an instance that lists a missing map or a map twice, a map two instances list, and two
 * maps of one world that overlap.
 * @param {Object[]} maps - `code`, `worldX`, `worldY`, `gridX`, `gridY`.
 * @param {Object[]} instances - `code`, `cyberiaMapCodes`.
 * @returns {string[]}
 * @memberof CyberiaMapRegistry
 */
export function registryDefects(maps, instances) {
  const defects = [];
  const byCode = new Map();
  for (const map of maps) {
    if (typeof map.code !== 'string' || !map.code || map.code.trim() !== map.code)
      defects.push(`Invalid map code: ${JSON.stringify(map.code)}`);
    else if (byCode.has(map.code)) defects.push(`Duplicate map code: ${map.code}`);
    else byCode.set(map.code, map);
    const spatial = mapSpatialDefect(map);
    if (spatial) defects.push(`Map ${map.code}: ${spatial}`);
  }
  const owners = new Map();
  for (const instance of instances) {
    for (const code of instance.cyberiaMapCodes ?? []) {
      if (!byCode.has(code)) defects.push(`Instance ${instance.code} lists missing map ${code}`);
      else if (owners.get(code) === instance.code) defects.push(`Instance ${instance.code} lists map ${code} twice`);
      else if (owners.has(code))
        defects.push(`Map ${code} has conflicting owners: ${owners.get(code)}, ${instance.code}`);
      else owners.set(code, instance.code);
    }
    const world = (instance.cyberiaMapCodes ?? []).map((code) => byCode.get(code)).filter(Boolean);
    for (const defect of worldPlacementDefects(world)) defects.push(`Instance ${instance.code}: ${defect}`);
  }
  return defects;
}

/**
 * The defects of a catalog, and the changes that bring its stored rows to its maps and instances:
 * `registered` for a code with no row, `repaired` for a row its checksum refutes, `reassigned` for a
 * new owner, `updated` for a new status, and `deprecated` for a row no instance lists. A code with
 * conflicting owners keeps its row as it is.
 * @param {Object} catalog
 * @param {string} catalog.catalog - Content database name.
 * @param {Object[]} catalog.maps - `code`, `status`, `worldX`, `worldY`, `gridX`, `gridY`.
 * @param {Object[]} catalog.instances - `_id`, `code`, `status`, `cyberiaMapCodes`.
 * @param {Object[]} catalog.stored - The registry rows of the catalog.
 * @returns {{defects: string[], changes: Array<{kind: string, entry: Object, before?: Object}>}}
 * @memberof CyberiaMapRegistry
 */
export function registryPlan({ catalog, maps, instances, stored }) {
  const statusOf = new Map(maps.map((map) => [map.code, map.status]));
  const listers = new Map();
  for (const instance of instances)
    for (const code of new Set(instance.cyberiaMapCodes ?? []))
      if (statusOf.has(code)) listers.set(code, [...(listers.get(code) ?? []), instance]);
  const current = new Map(stored.map((row) => [row.mapCode, row]));
  const changes = [];
  for (const [mapCode, [instance, ...others]] of [...listers].sort(([a], [b]) => a.localeCompare(b))) {
    const before = current.get(mapCode);
    current.delete(mapCode);
    if (others.length) continue;
    const owner = { instanceCode: instance.code, instanceId: instance._id };
    const entry = rowOf(catalog, mapCode, owner, registryStatus(statusOf.get(mapCode), instance.status));
    const kind = !before
      ? 'registered'
      : before.checksum !== registryChecksum(before)
        ? 'repaired'
        : before.instanceCode !== entry.instanceCode || String(before.instanceId) !== String(entry.instanceId)
          ? 'reassigned'
          : before.status !== entry.status
            ? 'updated'
            : '';
    if (kind) changes.push({ kind, entry, before });
  }
  for (const before of current.values()) {
    const intact = before.checksum === registryChecksum(before);
    if (intact && before.status === 'deprecated') continue;
    const entry = rowOf(catalog, before.mapCode, before, 'deprecated');
    changes.push({ kind: intact ? 'deprecated' : 'repaired', entry, before });
  }
  return { defects: registryDefects(maps, instances), changes };
}

/** The maps, instances and registry rows of the catalog the models serve. One session runs one read at a time. */
async function readCatalog(models, session) {
  const { CyberiaMap, CyberiaInstance, CyberiaGlobalMapCodeRegistry: Registry } = models;
  const catalog = CyberiaMap.db.name;
  const read = (query) =>
    query
      .limit(REGISTRY_LIMIT + 1)
      .session(session ?? null)
      .lean();
  const maps = await read(CyberiaMap.find({}, { code: 1, status: 1, worldX: 1, worldY: 1, gridX: 1, gridY: 1 }));
  const instances = await read(CyberiaInstance.find({}, { code: 1, status: 1, cyberiaMapCodes: 1 }));
  const stored = await read(Registry.find({ catalog }));
  if ([maps, instances, stored].some((rows) => rows.length > REGISTRY_LIMIT))
    throw failure(`The map registry of ${catalog} reads more than ${REGISTRY_LIMIT} records`);
  return { catalog, maps, instances, stored };
}

/**
 * Compares the registry of a catalog with its maps and instances, and with `apply` writes the
 * changes in the session given. A no-op writes nothing, so it keeps every version and timestamp. A
 * row another writer changed meanwhile fails the run, which a transaction retries whole.
 * @param {Object} models - `CyberiaMap`, `CyberiaInstance`, `CyberiaGlobalMapCodeRegistry`.
 * @param {{apply?: boolean, session?: import('mongoose').ClientSession}} [params]
 * @returns {Promise<{catalog: string, maps: number, instances: number, rows: number, defects: string[], changes: Object[]}>}
 * @memberof CyberiaMapRegistry
 */
export async function reconcileMapRegistry(models, { apply = false, session } = {}) {
  if (apply && !session) throw failure('Map registry writes need a transaction');
  const { catalog, maps, instances, stored } = await readCatalog(models, session);
  const { defects, changes } = registryPlan({ catalog, maps, instances, stored });
  const Registry = models.CyberiaGlobalMapCodeRegistry;
  for (const { entry, before } of apply ? changes : []) {
    const filter = before ? { _id: before._id, version: before.version } : { catalog, mapCode: entry.mapCode };
    const result = await Registry.updateOne(
      filter,
      { $set: entry, $inc: { version: 1 } },
      { upsert: !before, session, runValidators: true },
    );
    if (before && !result.matchedCount) throw failure(`The map registry row of ${entry.mapCode} changed meanwhile`);
  }
  if (apply && changes.length) {
    const kinds = Object.groupBy(changes, ({ kind }) => kind);
    logger.info(`Map registry of ${catalog} reconciled`, {
      changes: Object.fromEntries(Object.entries(kinds).map(([kind, rows]) => [kind, rows.length])),
    });
  }
  return {
    catalog,
    maps: maps.length,
    instances: instances.length,
    rows: stored.length,
    defects,
    changes: changes.map(({ kind, entry, before }) => ({
      kind,
      mapCode: entry.mapCode,
      instanceCode: entry.instanceCode,
      status: entry.status,
      ...(kind === 'reassigned' ? { from: before.instanceCode } : {}),
    })),
  };
}

/**
 * Runs a catalog write and the registry update in one transaction: both land, or neither does. The
 * write may add no defect to the catalog; a defect it found stays reported and blocks nothing.
 * @param {Object} models - `CyberiaMap`, `CyberiaInstance`, `CyberiaGlobalMapCodeRegistry`.
 * @param {(session: import('mongoose').ClientSession) => Promise<*>} [write]
 * @returns {Promise<{value: *, report: Object}>}
 * @throws {Error} `status` 409 for a defect the write adds.
 * @memberof CyberiaMapRegistry
 */
export async function registryTransaction(models, write) {
  const missing = REGISTRY_MODELS.filter((name) => !models[name]);
  if (missing.length) throw failure(`The map registry needs the models ${missing.join(', ')}`);
  const Registry = models.CyberiaGlobalMapCodeRegistry;
  if (Registry.db.getClient() !== models.CyberiaMap.db.getClient())
    throw failure('The map registry and its catalog need one MongoDB client');
  const session = await Registry.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const found = new Set();
      if (write) {
        const { maps, instances } = await readCatalog(models, session);
        for (const defect of registryDefects(maps, instances)) found.add(defect);
      }
      const value = write ? await write(session) : undefined;
      const report = await reconcileMapRegistry(models, { apply: true, session });
      const added = report.defects.filter((defect) => !found.has(defect));
      if (added.length) throw defectsError(added);
      result = { value, report };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * The models of a deployment context: its served catalog and its registry.
 * @param {{host: string, path: string}} options - Router options.
 * @returns {Object}
 * @memberof CyberiaMapRegistry
 */
export const registryModels = (options) => DataBaseProviderService.servedModels(options);

/**
 * The models of one catalog on a connection: its maps and instances in the catalog database, and
 * the registry in the database of the connection.
 * @param {import('mongoose').Connection} connection - The runtime database connection.
 * @param {string} catalog - Content database name.
 * @returns {Promise<Object>}
 * @memberof CyberiaMapRegistry
 */
export async function catalogRegistryModels(connection, catalog) {
  const content = connection.useDb(catalog, { useCache: true });
  return {
    CyberiaMap: await MongooseDB.bindModel(content, 'cyberia-map'),
    CyberiaInstance: await MongooseDB.bindModel(content, 'cyberia-instance'),
    CyberiaGlobalMapCodeRegistry: await MongooseDB.bindModel(connection, 'cyberia-global-map-code-registry'),
  };
}

/**
 * The owner a navigation resolves a map code of the served catalog to, or null for a code with no
 * row or a deprecated one.
 * @param {Object} models - `CyberiaMap`, `CyberiaInstance`, `CyberiaGlobalMapCodeRegistry`.
 * @param {string} mapCode
 * @returns {Promise<{mapCode: string, instanceCode: string, instanceName: string, status: string, version: number}|null>}
 * @throws {Error} `status` 409 for a row its checksum refutes, or one whose owner no longer lists the map.
 * @memberof CyberiaMapRegistry
 */
export async function resolveMapOwner(models, mapCode) {
  const row = await models.CyberiaGlobalMapCodeRegistry.findOne({
    catalog: models.CyberiaMap.db.name,
    mapCode: String(mapCode),
  }).lean();
  if (!row || !NAVIGABLE.has(row.status)) return null;
  if (row.checksum !== registryChecksum(row))
    throw failure(`The map registry row of ${mapCode} fails its checksum; reconcile the registry`);
  const owner = await models.CyberiaInstance.findOne(
    { _id: row.instanceId, code: row.instanceCode, cyberiaMapCodes: row.mapCode },
    { code: 1, name: 1 },
  ).lean();
  if (!owner) throw failure(`The map registry row of ${mapCode} names a stale owner; reconcile the registry`);
  return {
    mapCode: row.mapCode,
    instanceCode: owner.code,
    instanceName: owner.name || owner.code,
    status: row.status,
    version: row.version,
  };
}

/**
 * The indexes of the registry collection, and with `apply` the migration to the indexes of its
 * schema: they are built, then every index without a catalog key goes.
 * @param {import('mongoose').Model} Registry
 * @param {{apply?: boolean}} [params]
 * @returns {Promise<{unscoped: number, obsolete: string[], indexes: Object[]}>}
 * @throws {Error} `status` 409 with `apply` while rows without a catalog remain.
 * @memberof CyberiaMapRegistry
 */
export async function registryIndexes(Registry, { apply = false } = {}) {
  const indexes = await Registry.collection
    .indexes()
    .catch((error) => (error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error)));
  const obsolete = indexes.filter(({ key }) => !key.catalog && !key._id);
  const unscoped = await Registry.countDocuments({ catalog: { $exists: false } });
  if (apply) {
    if (unscoped)
      throw failure(
        `${unscoped} registry rows name no catalog; remove them, and a reconciliation of each catalog rebuilds its rows`,
      );
    await Registry.createIndexes();
    for (const { name } of obsolete) await Registry.collection.dropIndex(name);
  }
  return {
    unscoped,
    obsolete: obsolete.map(({ name }) => name),
    indexes: indexes.map(({ name, key, unique }) => ({ name, key, unique: !!unique })),
  };
}
