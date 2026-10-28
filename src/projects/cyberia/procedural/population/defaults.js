/**
 * The Entity Type Defaults workspace of a map population: the canonical `CyberiaEntityTypeDefault`
 * rows that apply to its staged items, with no map, universe or instance needed. A row applies to an
 * item when its live, dead or drop items name the item. A moderator adds other rows to the workspace
 * and removes rows from it; neither changes a row.
 *
 * The Entity Studio opened from the population saves to the draft of the population: an edit of a
 * stored row, or a new global row (`defaultDrafts`). The publication writes them. Each row shows where
 * the runtime runs it once the population publishes, read from its working graph: a row no instance
 * conf references is global, and every world runs it; a row a conf references runs only in that world.
 * A variant an instance draft proposes shows as a row of that instance, and each reference an instance
 * draft adds or removes shows as pending. The runtime order and resolver decide which row an entity of
 * the build of a row runs in each world; the workspace names each row that runs there in its place.
 *
 * @module src/projects/cyberia/procedural/population/defaults.js
 * @namespace CyberiaPopulationDefaults
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
} from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { DEFAULT_ROW_FIELDS } from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { runtimeEntityDefaults } from '../../../../api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { resolveEntityDefaultBuild } from '../../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { contentArtifact } from '../../content/content-artifact.js';
import { requestError } from '../engine.js';
import { STILL_OPEN, findPopulation, itemArtwork, only, openPopulation, targetsOf } from './population.js';
import { stageOf } from './stages.js';
import {
  checkedEntry,
  checkedRow,
  defaultRef,
  nextInstanceDraft,
  storedRef,
  unchangedDraft,
  variantRef,
  workingGraph,
  workingInstances,
} from './working-graph.js';

/** The item lists of a row that the runtime draws: alive, dead, and the drops it scatters. */
const ARTWORK_LISTS = Object.freeze(['liveItemIds', 'deadItemIds', 'dropItemIds']);

/** The item ids a row draws, in the order of its lists. */
const drawnBy = (row) => [...new Set(ARTWORK_LISTS.flatMap((list) => row[list] ?? []))];

/** The working instances that list the map of a population: the owners a new row of the map starts with. */
const mapInstancesOf = (instances, mapCode) =>
  [...instances.values()].filter(({ cyberiaMapCodes }) => cyberiaMapCodes.includes(mapCode)).map(({ code }) => code);

/** The rows of the default drafts of a population: each stored row with its edit over it, and the new rows. */
function draftedRows(population) {
  const drafts = population.defaultDrafts ?? [];
  const edits = new Map(drafts.filter(({ rowId }) => rowId).map((draft) => [draft.rowId, draft]));
  return {
    edited: [...edits.keys()],
    overlaid: (doc) => {
      const draft = edits.get(String(doc._id));
      return draft ? { ...doc, ...draft.row, draft } : doc;
    },
    created: drafts.filter(({ rowId }) => !rowId).map((draft) => ({ _id: defaultRef(draft.key), ...draft.row, draft })),
  };
}

/**
 * The worlds a row can run in once the population publishes: each instance of the working graph with
 * rows of its own now or stored, its variants among them, then every other world. A row no conf of
 * the graph and no conf of a deleted instance references is global, and a new row a default draft
 * proposes is global.
 */
async function worldsOf(models, population) {
  const { CyberiaEntityTypeDefault, CyberiaInstanceConf } = models;
  const { persisted, instances } = await workingInstances(models, population);
  const storedRefs = (code) => persisted.get(code)?.conf.entityDefaults ?? [];
  const own = [...instances.values()].filter(
    ({ code, conf }) => conf.entityDefaults.length > 0 || storedRefs(code).length > 0,
  );
  const orphans = await CyberiaInstanceConf.distinct('entityDefaults', {
    instanceCode: { $nin: [...instances.keys()] },
  });
  const ids = [
    ...new Set([...own.flatMap(({ conf }) => conf.entityDefaults.filter(storedRef)), ...orphans.map(String)]),
  ];
  const [referenced, stored] = await Promise.all([
    CyberiaEntityTypeDefault.find({ _id: { $in: ids } }).lean(),
    CyberiaEntityTypeDefault.find({ _id: { $nin: ids } })
      .sort({ _id: 1 })
      .lean(),
  ]);
  const { overlaid, created } = draftedRows(population);
  const refs = new Set([...instances.values()].flatMap(({ conf }) => conf.entityDefaults));
  const global = [...stored.map(overlaid), ...created.filter(({ _id }) => !refs.has(_id))];
  const rowOf = new Map([
    ...referenced.map((doc) => [String(doc._id), overlaid(doc)]),
    ...created.filter(({ _id }) => refs.has(_id)).map((doc) => [doc._id, doc]),
  ]);
  const { baseline } = contentArtifact();
  const order = (rows) => runtimeEntityDefaults({ instance: rows, baseline, global }).map(({ row }) => row);
  const worlds = [
    ...own.map(({ code, conf, variants }) => {
      const copies = variants.map(({ key, from, scope, row }) => ({
        _id: variantRef(key),
        ...row,
        variant: { instanceCode: code, key, from, scope },
      }));
      const copyOf = new Map(copies.map((copy) => [copy._id, copy]));
      return {
        instanceCode: code,
        rowIds: conf.entityDefaults,
        storedIds: storedRefs(code),
        variants: copies,
        rows: order(conf.entityDefaults.map((ref) => copyOf.get(ref) ?? rowOf.get(ref)).filter(Boolean)),
      };
    }),
    { instanceCode: null, rowIds: [], storedIds: [], variants: [], rows: order([]) },
  ];
  return {
    worlds,
    mapInstances: mapInstancesOf(instances, population.mapCode),
  };
}

/**
 * Where a row runs and which rows run in its place: in each world it reaches, the row an entity of
 * its exact build resolves to. `joins` and `leaves` name the instances whose draft adds or removes
 * its reference.
 */
function runtimeOf(doc, worlds) {
  const id = String(doc._id);
  const codesOf = (list) => worlds.filter((world) => world[list].includes(id)).map(({ instanceCode }) => instanceCode);
  const instances = codesOf('rowIds');
  const stored = codesOf('storedIds');
  const reached = instances.length > 0 ? worlds.filter(({ instanceCode }) => instances.includes(instanceCode)) : worlds;
  const shadowedBy = reached.flatMap(({ instanceCode, rows }) => {
    const winner = resolveEntityDefaultBuild({ entityType: doc.entityType, itemIds: doc.liveItemIds }, rows);
    return winner && String(winner._id) !== id ? [{ instanceCode, rowId: winner._id ? String(winner._id) : '' }] : [];
  });
  const overriddenBy = worlds.flatMap(({ variants }) =>
    variants.filter(({ variant }) => variant.from === id).map(({ variant }) => variant),
  );
  return {
    instances,
    joins: instances.filter((code) => !stored.includes(code)),
    leaves: stored.filter((code) => !instances.includes(code)),
    shadowedBy,
    overriddenBy,
  };
}

/**
 * The workspace of a population: its rows with what each stores or its draft proposes, the staged
 * items each names (none for a row a moderator added), where it runs, which rows run in its place and
 * the variants that override it; each variant the instance drafts propose for a row of the workspace;
 * each new row a default draft proposes; the artwork of each live, dead and drop item of a row
 * ({@link itemArtwork}); the staged items no row names, with the entity type a new row of each takes;
 * the rows removed from the workspace; and the instances that list the map of the population.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} population - A lean population.
 * @param {Object[]} targets - Its targets with their artwork ({@link targetsOf}).
 * @returns {Promise<{rows:Object[],items:Object<string,{itemType:string,cid:string,source:string}>,missing:Array<{itemId:string,entityType:string}>,removed:Object[],mapInstances:string[]}>}
 * @memberof CyberiaPopulationDefaults
 */
export async function workspaceOf(models, population, targets) {
  const staged = population.targets.map(({ itemId }) => itemId);
  const { added, removed } = population.defaults;
  const hidden = new Set(removed.map(String));
  const { edited, overlaid, created } = draftedRows(population);
  const [docs, { worlds, mapInstances }, removedDocs] = await Promise.all([
    models.CyberiaEntityTypeDefault.find({
      $or: [
        ...ARTWORK_LISTS.map((list) => ({ [list]: { $in: staged } })),
        { _id: { $in: [...added, ...edited.map((rowId) => new Types.ObjectId(rowId))] } },
      ],
    })
      .sort({ entityType: 1, _id: 1 })
      .lean(),
    worldsOf(models, population),
    models.CyberiaEntityTypeDefault.find({ _id: { $in: removed } }, { entityType: 1, liveItemIds: 1 }).lean(),
  ]);
  const names = (doc) => staged.some((itemId) => drawnBy(doc).includes(itemId));
  const shown = [...docs.map(overlaid), ...created].filter(
    (doc) =>
      !hidden.has(String(doc._id)) &&
      (doc.draft || names(doc) || added.some((rowId) => String(rowId) === String(doc._id))),
  );
  const variants = worlds
    .flatMap((world) => world.variants)
    .filter(({ variant }) => shown.some((doc) => String(doc._id) === variant.from));
  const rows = [...shown, ...variants].map((doc) => {
    const itemIds = staged.filter((itemId) => drawnBy(doc).includes(itemId));
    return {
      rowId: String(doc._id),
      updatedAt: doc.updatedAt ?? null,
      ...Object.fromEntries(DEFAULT_ROW_FIELDS.map((field) => [field, doc[field] ?? (field === 'behavior' ? '' : [])])),
      itemIds,
      added: !doc.variant && !doc.draft && itemIds.length === 0,
      variant: doc.variant ?? null,
      draft: doc.draft
        ? { key: doc.draft.key, revision: doc.draft.revision, state: doc.draft.rowId ? 'draft' : 'new' }
        : null,
      ...runtimeOf(doc, worlds),
    };
  });
  const named = [...new Set(rows.flatMap(drawnBy))];
  return {
    rows,
    items: Object.fromEntries(await itemArtwork(models, targets, named)),
    missing: population.targets
      .filter(({ itemId }) => !named.includes(itemId))
      .map(({ itemId, stage, itemType }) => ({
        itemId,
        entityType: stageOf(stage).entityTypes.find((type) => ENTITY_TYPE_TO_ITEM_TYPES[type].includes(itemType)),
      })),
    removed: removedDocs.map(({ _id, entityType, liveItemIds }) => ({ rowId: String(_id), entityType, liveItemIds })),
    mapInstances,
  };
}

/** The entity types the runtime spawns: no map places them, so a row of these reaches every world that runs it. */
const SPAWNED = new Set([
  ENTITY_TYPES.player,
  ENTITY_TYPES.other_player,
  ENTITY_TYPES.skill,
  ENTITY_TYPES.coin,
  ENTITY_TYPES.loot,
]);

/**
 * The worlds a publication changes through entity-type defaults, by the order and the resolver the
 * runtime applies: each world where an entity its maps place resolves to another row, or to a row the
 * population edits, and each world whose rows of a spawned type change. A world no change reaches stays
 * as it is, so a change of a global row reloads only the worlds that run it.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} population - A lean population.
 * @returns {Promise<string[]>} Instance codes, sorted.
 * @memberof CyberiaPopulationDefaults
 */
export async function defaultWorlds(models, population) {
  const { persisted, instances } = await workingInstances(models, population);
  const codes = [...new Set([...persisted.keys(), ...instances.keys()])];
  const [stored, orphans] = await Promise.all([
    models.CyberiaEntityTypeDefault.find({}).sort({ _id: 1 }).lean(),
    models.CyberiaInstanceConf.distinct('entityDefaults', { instanceCode: { $nin: codes } }),
  ]);
  const { overlaid, created } = draftedRows(population);
  const before = new Map(stored.map((row) => [String(row._id), row]));
  const after = new Map([
    ...stored.map((row) => [String(row._id), overlaid(row)]),
    ...created.map((row) => [row._id, row]),
  ]);
  const globalOf = (rows, documents) => {
    const referenced = new Set([
      ...[...documents.values()].flatMap(({ conf }) => conf.entityDefaults),
      ...orphans.map(String),
    ]);
    return [...rows.values()].filter((row) => !referenced.has(String(row._id)));
  };
  const { baseline } = contentArtifact();
  const orderOf = (instance, rows, global) =>
    runtimeEntityDefaults({
      instance: (instance?.conf.entityDefaults ?? []).map((ref) => rows.get(ref)).filter(Boolean),
      baseline,
      global,
    }).map(({ row }) => row);
  const [globalBefore, globalAfter] = [globalOf(before, persisted), globalOf(after, instances)];
  const mapCodes = [
    ...new Set([...persisted.values(), ...instances.values()].flatMap(({ cyberiaMapCodes }) => cyberiaMapCodes)),
  ];
  const placed = new Map(
    (
      await models.CyberiaMap.find(
        { code: { $in: mapCodes } },
        { code: 1, 'entities.entityType': 1, 'entities.objectLayerItemIds': 1 },
      ).lean()
    ).map(({ code, entities }) => [code, entities]),
  );
  if (population.draft) placed.set(population.mapCode, population.draft.entities);
  const spawned = (rows) => rows.filter(({ entityType }) => SPAWNED.has(entityType));
  return codes
    .filter((code) => {
      const was = orderOf(persisted.get(code), before, globalBefore);
      const variants = (instances.get(code)?.variants ?? []).map(({ key, row }) => [variantRef(key), { ...row }]);
      const now = orderOf(instances.get(code), new Map([...after, ...variants]), globalAfter);
      const entities = (instances.get(code) ?? persisted.get(code)).cyberiaMapCodes.flatMap(
        (mapCode) => placed.get(mapCode) ?? [],
      );
      const resolve = (rows) =>
        entities.map(({ entityType, objectLayerItemIds }) =>
          resolveEntityDefaultBuild({ entityType, itemIds: objectLayerItemIds }, rows),
        );
      const [wasPlaced, nowPlaced] = [resolve(was), resolve(now)];
      const [wasSpawned, nowSpawned] = [spawned(was), spawned(now)];
      return (
        wasPlaced.some((row, at) => row !== nowPlaced[at]) ||
        wasSpawned.length !== nowSpawned.length ||
        wasSpawned.some((row, at) => row !== nowSpawned[at])
      );
    })
    .sort();
}

/**
 * Reads the workspace of a population.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id
 * @returns {Promise<Object>} {@link workspaceOf}.
 * @throws {Error} 404 for an unknown population.
 * @memberof CyberiaPopulationDefaults
 */
export async function populationDefaults(models, id) {
  const population = await findPopulation(models, id);
  return await workspaceOf(models, population, await targetsOf(models, population));
}

/** The id of a stored row a workspace change names. */
async function storedRow({ CyberiaEntityTypeDefault }, rowId) {
  if (!Types.ObjectId.isValid(String(rowId)) || !(await CyberiaEntityTypeDefault.exists({ _id: rowId })))
    throw requestError(`There is no entity-type default ${rowId}`, 404);
  return new Types.ObjectId(String(rowId));
}

/**
 * Adds a stored row to the workspace of a population, or brings back a row removed from it.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.rowId
 * @returns {Promise<Object>} {@link workspaceOf}.
 * @throws {Error} 404 for an unknown row; 409 for a closed population.
 * @memberof CyberiaPopulationDefaults
 */
export async function addDefault({ models, id, rowId }) {
  const population = await openPopulation(models, id);
  const row = await storedRow(models, rowId);
  await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id },
    { $addToSet: { 'defaults.added': row }, $pull: { 'defaults.removed': row }, $inc: { revision: 1 } },
  );
  return await populationDefaults(models, id);
}

/**
 * Removes a row from the workspace of a population. The row, its live item ids and every other
 * configuration stay as they are.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.rowId
 * @returns {Promise<Object>} {@link workspaceOf}.
 * @throws {Error} 404 for an unknown row; 409 for a closed population.
 * @memberof CyberiaPopulationDefaults
 */
export async function removeDefault({ models, id, rowId }) {
  const population = await openPopulation(models, id);
  const row = await storedRow(models, rowId);
  await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id },
    { $pull: { 'defaults.added': row }, $addToSet: { 'defaults.removed': row }, $inc: { revision: 1 } },
  );
  return await populationDefaults(models, id);
}

/** The fields of a row a request names: an object of the row fields only. */
function rowOf(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw requestError('A row is an object');
  only(body, DEFAULT_ROW_FIELDS, 'A row');
  return JSON.parse(JSON.stringify(body));
}

/** The codes of the instances of a working graph that reference `ref`, now and as stored. */
const runnersOf = (graph, ref) => ({
  instanceCodes: [...graph.instances.values()]
    .filter(({ conf }) => conf.entityDefaults.includes(ref))
    .map(({ code }) => code),
  storedInstanceCodes: [...graph.persisted.instances.values()]
    .filter(({ conf }) => conf.entityDefaults.includes(ref))
    .map(({ code }) => code),
});

/**
 * An entity-type default as the Entity Studio of a population edits it, from the working graph: the
 * stored row `ref` names (a row id) with the draft of the population over it, the new row a default
 * draft proposes (its key), or nothing yet (`new`). It carries the instances that run it now and as
 * stored, every instance of the graph, and the instances that list the map of the population.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id - Population id.
 * @param {string} ref - A row id, a draft key, or `new`.
 * @param {Object} options - Router options.
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown population, row or draft.
 * @memberof CyberiaPopulationDefaults
 */
export async function defaultView(models, id, ref, options) {
  const population = await findPopulation(models, id);
  const graph = await workingGraph(models, population, options);
  const draft = graph.defaults.find(({ key, rowId }) => key === ref || rowId === ref) ?? null;
  const rowId = draft?.rowId ?? (storedRef(ref) ? ref : null);
  const stored = rowId ? await models.CyberiaEntityTypeDefault.findById(await storedRow(models, rowId)).lean() : null;
  if (!draft && !stored && ref !== 'new')
    throw requestError(`The population drafts no entity-type default ${ref}`, 404);
  const runners = draft || stored ? runnersOf(graph, rowId ?? defaultRef(draft.key)) : null;
  return {
    rowId,
    key: draft?.key ?? null,
    revision: draft?.revision ?? 0,
    baseUpdatedAt: draft?.baseUpdatedAt ?? stored?.updatedAt ?? null,
    state: draft ? (rowId ? 'draft' : 'new') : stored ? 'persisted' : 'unsaved',
    row: draft?.row ?? (stored && Object.fromEntries(DEFAULT_ROW_FIELDS.map((field) => [field, stored[field]]))),
    global: draft?.global ?? false,
    instanceCodes: runners?.instanceCodes ?? [],
    storedInstanceCodes: runners?.storedInstanceCodes ?? [],
    instances: [...graph.instances.keys()].sort(),
    mapInstances: mapInstancesOf(graph.instances, graph.population.mapCode),
    populationRevision: population.revision,
  };
}

/**
 * Saves a default from the Entity Studio of a population, `{ rowId, key, baseUpdatedAt, revision, row,
 * instanceCodes, global, populationRevision }`: the row, as an edit of the stored row `rowId` or as a new
 * row, and the instances that run it, as references in their drafts. A row no instance runs needs
 * `global`: every world then runs it. Both land in one write of the population at the revision the
 * editor read, so the row and its references never part. Nothing stored changes: the publication
 * writes them.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {Object} params.body
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link defaultView}.
 * @throws {Error} 400 for a row the canonical model refuses, an unknown instance, or no instance and no
 *   `global`; 404 for an unknown row; 409 when the population, the draft or the stored row changed since
 *   the editor read it, or for a closed population.
 * @memberof CyberiaPopulationDefaults
 */
export async function saveDefault({ models, id, body, actor, options }) {
  const population = await openPopulation(models, id);
  only(
    body,
    ['rowId', 'key', 'baseUpdatedAt', 'revision', 'row', 'instanceCodes', 'global', 'populationRevision'],
    'A default',
  );
  if (body.populationRevision !== population.revision)
    throw requestError('The population changed since you opened this default: reopen it', 409);
  const graph = await workingGraph(models, population, options);
  const current = graph.defaults.find(({ key, rowId }) => key === body.key || (body.rowId && rowId === body.rowId));
  if ((current?.revision ?? 0) !== (body.revision ?? 0))
    throw requestError('The draft of this default changed since you opened it: reopen it', 409);
  const rowId = current?.rowId ?? (body.rowId ? String(body.rowId) : null);
  const stored = rowId ? await models.CyberiaEntityTypeDefault.findById(await storedRow(models, rowId)).lean() : null;
  if (stored && !current && new Date(body.baseUpdatedAt).getTime() !== stored.updatedAt?.getTime())
    throw requestError('This entity default changed since you opened it: reload it, then save again', 409);
  const codes = [...new Set((body.instanceCodes ?? []).map(String))];
  const unknown = codes.find((code) => !graph.instances.has(code));
  if (unknown) throw requestError(`There is no instance ${unknown}`);
  if (codes.length === 0 && !body.global)
    throw requestError('Choose the instances that run this default, or make it global: every world runs it');
  const key = current?.key ?? randomUUID();
  const ref = rowId ?? defaultRef(key);
  const row = await checkedRow(models, rowOf(body.row), stored ?? {});
  const runners = runnersOf(graph, ref);
  const unchanged =
    stored &&
    DEFAULT_ROW_FIELDS.every((field) => JSON.stringify(row[field] ?? null) === JSON.stringify(stored[field] ?? null));
  const keepsDraft = !unchanged || (codes.length === 0 && runners.storedInstanceCodes.length > 0);
  const defaultDrafts = (population.defaultDrafts ?? []).filter((draft) => draft.key !== key);
  if (keepsDraft)
    defaultDrafts.push(
      await checkedEntry(models, 'defaultDrafts', {
        key,
        rowId,
        baseUpdatedAt: current?.baseUpdatedAt ?? stored?.updatedAt ?? null,
        revision: (current?.revision ?? 0) + 1,
        row,
        global: codes.length === 0,
        savedAt: new Date(),
        savedBy: actor,
      }),
    );
  const instanceDrafts = [...(population.instanceDrafts ?? [])];
  for (const code of new Set([...codes, ...runners.instanceCodes])) {
    const linked = codes.includes(code);
    if (linked === runners.instanceCodes.includes(code)) continue;
    const { next } = nextInstanceDraft(
      population,
      graph,
      code,
      (instance) => ({
        conf: {
          ...instance.conf,
          entityDefaults: linked
            ? [...instance.conf.entityDefaults, ref]
            : instance.conf.entityDefaults.filter((held) => held !== ref),
        },
      }),
      actor,
    );
    const entry = await checkedEntry(models, 'instanceDrafts', next);
    const at = instanceDrafts.findIndex((held) => held.code === code);
    if (unchangedDraft(entry)) {
      if (at >= 0) instanceDrafts.splice(at, 1);
    } else if (at < 0) instanceDrafts.push(entry);
    else instanceDrafts[at] = entry;
  }
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, revision: population.revision, ...STILL_OPEN },
    {
      $set: { defaultDrafts, instanceDrafts },
      $inc: { revision: 1 },
    },
  );
  if (!written.matchedCount) throw requestError('The population changed while saving: reopen this default', 409);
  return await defaultView(models, id, keepsDraft ? key : rowId, options);
}

/**
 * Discards a default draft: the workspace shows the stored row again, or no new row, and every instance
 * draft stops referencing a new row it proposed.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.key - Draft key.
 * @returns {Promise<{discarded:boolean}>}
 * @throws {Error} 409 for a closed population, or one that changed meanwhile.
 * @memberof CyberiaPopulationDefaults
 */
export async function discardDefaultDraft({ models, id, key }) {
  const population = await openPopulation(models, id);
  if (!(population.defaultDrafts ?? []).some((draft) => draft.key === key)) return { discarded: false };
  const ref = defaultRef(key);
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, revision: population.revision, ...STILL_OPEN },
    {
      $set: {
        defaultDrafts: population.defaultDrafts.filter((draft) => draft.key !== key),
        instanceDrafts: (population.instanceDrafts ?? []).flatMap((entry) => {
          if (!entry.conf.entityDefaults.includes(ref)) return [entry];
          const next = {
            ...entry,
            conf: { ...entry.conf, entityDefaults: entry.conf.entityDefaults.filter((held) => held !== ref) },
          };
          return unchangedDraft(next) ? [] : [next];
        }),
      },
      $inc: { revision: 1 },
    },
  );
  if (!written.matchedCount) throw requestError('The population changed meanwhile: try again', 409);
  return { discarded: true };
}
