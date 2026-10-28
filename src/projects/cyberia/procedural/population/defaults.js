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
import { ENTITY_TYPE_TO_ITEM_TYPES } from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { DEFAULT_ROW_FIELDS } from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { runtimeEntityDefaults } from '../../../../api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { resolveEntityDefaultBuild } from '../../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { contentArtifact } from '../../content/content-artifact.js';
import { requestError } from '../engine.js';
import { findPopulation, itemArtwork, only, openPopulation, targetsOf } from './population.js';
import { stageOf } from './stages.js';
import { checkedRow, variantKeyOf, variantRef, workingInstances, writeDraft } from './working-graph.js';

/** The item lists of a row that the runtime draws: alive, dead, and the drops it scatters. */
const ARTWORK_LISTS = Object.freeze(['liveItemIds', 'deadItemIds', 'dropItemIds']);

/** The item ids a row draws, in the order of its lists. */
const drawnBy = (row) => [...new Set(ARTWORK_LISTS.flatMap((list) => row[list] ?? []))];

/** The id a new row a default draft proposes shows under until the publication creates it. */
const draftRowId = (key) => `draft:${key}`;

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
    created: drafts.filter(({ rowId }) => !rowId).map((draft) => ({ _id: draftRowId(draft.key), ...draft.row, draft })),
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
    ...new Set([
      ...own.flatMap(({ conf }) => conf.entityDefaults.filter((ref) => !variantKeyOf(ref))),
      ...orphans.map(String),
    ]),
  ];
  const [referenced, stored] = await Promise.all([
    CyberiaEntityTypeDefault.find({ _id: { $in: ids } }).lean(),
    CyberiaEntityTypeDefault.find({ _id: { $nin: ids } })
      .sort({ _id: 1 })
      .lean(),
  ]);
  const { overlaid, created } = draftedRows(population);
  const global = [...stored.map(overlaid), ...created];
  const rowOf = new Map(referenced.map((doc) => [String(doc._id), overlaid(doc)]));
  const { baseline } = contentArtifact();
  const order = (rows) => runtimeEntityDefaults({ instance: rows, baseline, global }).map(({ row }) => row);
  return [
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
 * and the rows removed from the workspace.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} population - A lean population.
 * @param {Object[]} targets - Its targets with their artwork ({@link targetsOf}).
 * @returns {Promise<{rows:Object[],items:Object<string,{itemType:string,cid:string,source:string}>,missing:Array<{itemId:string,entityType:string}>,removed:Object[]}>}
 * @memberof CyberiaPopulationDefaults
 */
export async function workspaceOf(models, population, targets) {
  const staged = population.targets.map(({ itemId }) => itemId);
  const { added, removed } = population.defaults;
  const hidden = new Set(removed.map(String));
  const { edited, overlaid, created } = draftedRows(population);
  const [docs, worlds, removedDocs] = await Promise.all([
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
  };
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

/** The default draft of a population a key names, or a 404. */
function draftOf(population, key) {
  const draft = (population.defaultDrafts ?? []).find((entry) => entry.key === key);
  if (!draft) throw requestError(`The population drafts no entity-type default ${key}`, 404);
  return draft;
}

/** The fields of a row a request names: an object of the row fields only. */
function rowOf(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw requestError('A row is an object');
  only(body, DEFAULT_ROW_FIELDS, 'A row');
  return JSON.parse(JSON.stringify(body));
}

/**
 * A default draft of a population, with the instances whose working draft references the row it edits.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id - Population id.
 * @param {string} key - Draft key.
 * @returns {Promise<Object>} `{ key, rowId, baseUpdatedAt, revision, row, instanceCodes }`.
 * @throws {Error} 404 for an unknown population or draft.
 * @memberof CyberiaPopulationDefaults
 */
export async function defaultDraftView(models, id, key) {
  const population = await findPopulation(models, id);
  const { rowId, baseUpdatedAt, revision, row } = draftOf(population, key);
  const { instances } = rowId ? await workingInstances(models, population) : { instances: new Map() };
  return {
    key,
    rowId,
    baseUpdatedAt,
    revision,
    row,
    instanceCodes: [...instances.values()]
      .filter(({ conf }) => conf.entityDefaults.includes(rowId))
      .map(({ code }) => code),
  };
}

/**
 * Starts a default draft, `{ rowId, baseUpdatedAt, row }`: an edit of the stored row `rowId` at the
 * `updatedAt` the editor read, or a new global row with no `rowId`. Nothing stored changes: the
 * publication writes it. One draft per stored row.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {Object} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link defaultDraftView}.
 * @throws {Error} 400 for a row the canonical model refuses; 404 for an unknown row; 409 for a row that
 *   changed since the editor read it, one the population drafts already, or a closed population.
 * @memberof CyberiaPopulationDefaults
 */
export async function createDefaultDraft({ models, id, body, actor }) {
  const population = await openPopulation(models, id);
  only(body, ['rowId', 'baseUpdatedAt', 'row'], 'A default draft');
  const rowId = body.rowId ? String(body.rowId) : null;
  const stored = rowId && (await models.CyberiaEntityTypeDefault.findById(await storedRow(models, rowId)).lean());
  if (stored && new Date(body.baseUpdatedAt).getTime() !== stored.updatedAt?.getTime())
    throw requestError('This entity default changed since you opened it: reload it, then save again', 409);
  if (rowId && (population.defaultDrafts ?? []).some((draft) => draft.rowId === rowId))
    throw requestError(`The population drafts an edit of entity-type default ${rowId} already: open it`, 409);
  const key = randomUUID();
  await writeDraft({
    models,
    population,
    field: 'defaultDrafts',
    identity: { key },
    exclusive: { key, rowId },
    revision: 0,
    next: {
      key,
      rowId,
      baseUpdatedAt: stored?.updatedAt ?? null,
      revision: 1,
      row: await checkedRow(models, rowOf(body.row), stored ?? {}),
      savedAt: new Date(),
      savedBy: actor,
    },
  });
  return await defaultDraftView(models, id, key);
}

/**
 * Saves the row of a default draft, `{ row, revision }`, checked as a canonical write checks it.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.key - Draft key.
 * @param {Object} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link defaultDraftView}.
 * @throws {Error} 400 for a row the canonical model refuses; 404 for an unknown draft; 409 for a stale revision.
 * @memberof CyberiaPopulationDefaults
 */
export async function saveDefaultDraft({ models, id, key, body, actor }) {
  const population = await openPopulation(models, id);
  only(body, ['row', 'revision'], 'A default draft');
  const current = draftOf(population, key);
  const stored = current.rowId ? await models.CyberiaEntityTypeDefault.findById(current.rowId).lean() : null;
  await writeDraft({
    models,
    population,
    field: 'defaultDrafts',
    identity: { key },
    revision: body.revision,
    next: {
      ...current,
      revision: current.revision + 1,
      row: await checkedRow(models, rowOf(body.row), stored ?? {}),
      savedAt: new Date(),
      savedBy: actor,
    },
  });
  return await defaultDraftView(models, id, key);
}

/**
 * Discards a default draft: the workspace shows the stored row again, or no new row.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.key - Draft key.
 * @returns {Promise<{discarded:boolean}>}
 * @throws {Error} 409 for a closed population.
 * @memberof CyberiaPopulationDefaults
 */
export async function discardDefaultDraft({ models, id, key }) {
  const population = await openPopulation(models, id);
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'defaultDrafts.key': key },
    { $pull: { defaultDrafts: { key } }, $inc: { revision: 1 } },
  );
  return { discarded: written.modifiedCount > 0 };
}
