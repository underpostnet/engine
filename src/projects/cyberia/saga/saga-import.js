/**
 * The import of a compiled saga into a workspace: its document families, its CyberiaSaga record and
 * the world it joins. The default world is the authoring world named after the saga; a named world
 * must exist unless the caller asks to create it. An import adds and links only: a stored record,
 * world setting, map list or conf reference stays, and a map another world owns stays there. The
 * saga record, the world, its conf and the map registry change in one transaction, so a rerun
 * completes what a failed run left.
 *
 * @module src/projects/cyberia/saga/saga-import.js
 * @namespace CyberiaSagaImport
 */
import {
  contentSummary,
  entityTypeDefaultKey,
  holdsContent,
  importContent,
  materializeObjectLayers,
  planContent,
  planMaterialization,
} from '../content/content-artifact.js';
import { registryTransaction } from '../instance/map-registry.js';

const failure = (status, message) => Object.assign(new Error(message), { status, expected: true });

/**
 * What an import of a saga does to the saga record and the world, read in `session` when one is given.
 * @param {Object} params
 * @param {{saga:Object, instance:Object, families:Object}} params.saga - A compiled saga.
 * @param {Object} params.models - `CyberiaSaga`, `CyberiaInstance`, `CyberiaInstanceConf`, `CyberiaEntityTypeDefault`.
 * @param {string} [params.instanceCode] - The world to join; the authoring world of the saga by default.
 * @param {boolean} [params.rebind=false] - Replace a saga record that differs.
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<Object>} `saga`, `targetInstance`, `instanceConf`, `maps` and `places`, as {@link importSaga} reports them.
 * @memberof CyberiaSagaImport
 */
export async function planSagaImport({ saga: compiled, models, instanceCode = '', rebind = false, session = null }) {
  const { saga, instance: shell, families } = compiled;
  const code = instanceCode || shell.code;
  const read = (query) => query.session(session).lean();
  const record = await read(models.CyberiaSaga.findOne({ code: saga.code }));
  const instance = await read(models.CyberiaInstance.findOne({ code }, { conf: 1, cyberiaMapCodes: 1 }));
  const conf = await read(models.CyberiaInstanceConf.findOne({ instanceCode: code }, { entityDefaults: 1 }));
  const others = await read(
    models.CyberiaInstance.find(
      { code: { $ne: code }, cyberiaMapCodes: { $in: shell.cyberiaMapCodes } },
      { code: 1, cyberiaMapCodes: 1 },
    ),
  );
  const referenced = new Set((conf?.entityDefaults ?? []).map(String));
  const defaults = [];
  for (const row of families.entityTypeDefaults)
    defaults.push((await read(models.CyberiaEntityTypeDefault.findOne(entityTypeDefaultKey(row), { _id: 1 })))?._id);
  const missing = defaults.filter((id) => !id || !referenced.has(String(id)));

  const owners = new Map(others.flatMap((other) => other.cyberiaMapCodes.map((mapCode) => [mapCode, other.code])));
  const listed = new Set(instance?.cyberiaMapCodes ?? []);
  const maps = { attached: [], alreadyAttached: [], ownedElsewhere: [] };
  for (const mapCode of shell.cyberiaMapCodes)
    if (listed.has(mapCode)) maps.alreadyAttached.push(mapCode);
    else if (owners.has(mapCode)) maps.ownedElsewhere.push({ mapCode, instanceCode: owners.get(mapCode) });
    else maps.attached.push(mapCode);

  const fields = record ? Object.keys(saga).filter((key) => !holdsContent(record[key], saga[key])) : [];
  return {
    saga: {
      code: saga.code,
      status: !record ? 'inserted' : fields.length === 0 ? 'in-sync' : rebind ? 'rebound' : 'differs-kept',
      fields,
    },
    targetInstance: {
      code,
      created: !instance,
      confLinked: Boolean(instance) && (!conf || String(instance.conf ?? '') !== String(conf._id)),
    },
    instanceConf: { created: !conf, defaultsAdded: missing.length, defaultsPresent: defaults.length - missing.length },
    maps,
    places: saga.placeCodes ?? [],
  };
}

/** The fields a world created for this import starts with: the shell of the saga for its authoring world. */
const worldFields = ({ code, name, description, tags, topologyMode, portals }, instanceCode) =>
  instanceCode === code
    ? { code, name, description, tags, topologyMode, portals }
    : { code: instanceCode, name: instanceCode };

/** Writes a {@link planSagaImport} result in the session: the saga record, the conf, then the world. */
async function writeSagaImport({ saga: compiled, models, plan, defaultIds, session }) {
  const { saga, instance: shell } = compiled;
  const { code } = plan.targetInstance;
  if (plan.saga.status === 'inserted')
    await models.CyberiaSaga.updateOne({ code: saga.code }, { $setOnInsert: saga }, { upsert: true, session });
  else if (plan.saga.status === 'rebound')
    await models.CyberiaSaga.updateOne({ code: saga.code }, { $set: saga }, { session });

  const conf = await models.CyberiaInstanceConf.findOneAndUpdate(
    { instanceCode: code },
    { $setOnInsert: { instanceCode: code }, $addToSet: { entityDefaults: { $each: defaultIds } } },
    { upsert: true, returnDocument: 'after', projection: { _id: 1 }, session },
  ).lean();

  const attach = plan.maps.attached.length > 0 ? { $addToSet: { cyberiaMapCodes: { $each: plan.maps.attached } } } : {};
  if (plan.targetInstance.created)
    await models.CyberiaInstance.updateOne(
      { code },
      { $setOnInsert: { ...worldFields(shell, code), conf: conf._id }, ...attach },
      { upsert: true, session },
    );
  else if (plan.maps.attached.length > 0 || plan.targetInstance.confLinked)
    // A world write moves its revision, so an Instance Studio save of an older read fails instead of undoing it.
    await models.CyberiaInstance.updateOne(
      { code },
      { ...attach, ...(plan.targetInstance.confLinked && { $set: { conf: conf._id } }), $inc: { revision: 1 } },
      { session },
    );
}

/**
 * Imports a compiled saga: its Object Layer items, then, in one transaction with the map registry,
 * its documents, its saga record, the world it joins and that world's conf. A second import at the
 * same time retries the transaction and finds the first one's documents. A saga record that
 * differs stays unless `rebind`. The world takes the saga maps no other world owns; the places of the saga join no world.
 * The conf takes a reference to each entity-type default of the saga. A dry run plans and writes nothing.
 * @param {Object} params
 * @param {{saga:Object, instance:Object, families:Object}} params.saga - A compiled saga.
 * @param {Object} params.models - The content models, the catalog models and `CyberiaGlobalMapCodeRegistry`,
 *   all on one MongoDB client.
 * @param {{host:string,path:string}} [params.context] - Host the models belong to.
 * @param {boolean} [params.rebind=false] - Move differing labels, documents and the saga record to the artifact.
 * @param {string} [params.instanceCode] - The world to join; the authoring world of the saga by default.
 * @param {boolean} [params.createInstance=false] - Create a named world that does not exist.
 * @param {boolean} [params.dryRun=false]
 * @returns {Promise<{plan:Object, report:Object}>} The content plan, and the report: `saga`, `targetInstance`,
 *   `instanceConf`, `maps`, `places`, `families`, `conflicts`, and the `registry` changes and defects.
 * @throws {Error} 404 for a named world that does not exist; 409 for a defect the world write adds. An
 *   error in the transaction wrote no document: its `report` names the Object Layer items written before it.
 * @memberof CyberiaSagaImport
 */
export async function importSaga({
  saga: compiled,
  models,
  context,
  rebind = false,
  instanceCode = '',
  createInstance = false,
  dryRun = false,
}) {
  const planned = await planSagaImport({ saga: compiled, models, instanceCode, rebind });
  if (instanceCode && planned.targetInstance.created && !createInstance)
    throw failure(404, `World ${instanceCode} does not exist: name a stored world, or pass --create-instance`);
  if (dryRun) {
    const plan = await planContent({ families: compiled.families, models });
    return { plan, report: { ...planned, families: contentSummary(plan, rebind), conflicts: [] } };
  }
  const { objectLayers, ...families } = compiled.families;
  const items = await planMaterialization({ items: objectLayers, models });
  await materializeObjectLayers({ plan: items, items: objectLayers, models, options: context, rebind });
  const {
    value: { content, world },
    report: registry,
  } = await registryTransaction(models, async (session) => {
    const imported = await importContent({ families: { ...families, objectLayers: [] }, models, rebind, session });
    const plan = await planSagaImport({ saga: compiled, models, instanceCode, rebind, session });
    await writeSagaImport({ saga: compiled, models, plan, defaultIds: imported.entityTypeDefaultIds, session });
    return { content: imported, world: plan };
  }).catch((error) => {
    throw Object.assign(error, {
      report: { families: contentSummary({ objectLayers: items, documents: {} }, rebind), conflicts: [] },
    });
  });
  const plan = { ...content.plan, objectLayers: items };
  return {
    plan,
    report: {
      ...world,
      families: contentSummary(plan, rebind, content.conflicts),
      conflicts: content.conflicts,
      registry: { changes: registry.changes, defects: registry.defects },
    },
  };
}
