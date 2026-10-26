/**
 * The Entity Type Defaults workspace of a map population: the canonical `CyberiaEntityTypeDefault`
 * rows that apply to its staged items, with no map, universe or instance needed. A row applies to an
 * item when its live, dead or drop items name the item. A moderator adds other rows to the workspace
 * and removes rows from it; neither changes a row. The Entity Studio edits the rows themselves.
 *
 * Each row shows where the runtime runs it: a row no instance conf references is global, and every
 * world runs it; a row a conf references runs only in that world. The runtime order and resolver
 * decide which row an entity of the build of a row runs in each world; the workspace names each row
 * that runs there in its place.
 *
 * @module src/projects/cyberia/procedural/population/defaults.js
 * @namespace CyberiaPopulationDefaults
 */
import { Types } from 'mongoose';
import { ENTITY_TYPE_TO_ITEM_TYPES } from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import {
  findGlobalDefaults,
  runtimeEntityDefaults,
} from '../../../../api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { resolveEntityDefaultBuild } from '../../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { contentArtifact } from '../../content/content-artifact.js';
import { requestError } from '../engine.js';
import { findPopulation, itemArtwork, openPopulation, targetsOf } from './population.js';
import { stageOf } from './stages.js';

/** The item lists of a row that the runtime draws: alive, dead, and the drops it scatters. */
const ARTWORK_LISTS = Object.freeze(['liveItemIds', 'deadItemIds', 'dropItemIds']);

/** The item ids a row draws, in the order of its lists. */
const drawnBy = (row) => [...new Set(ARTWORK_LISTS.flatMap((list) => row[list] ?? []))];

const ROW_FIELDS = Object.freeze([
  'entityType',
  'liveItemIds',
  'deadItemIds',
  'dropItemIds',
  'inventoryItemsIds',
  'overrideItemsIdsState',
  'behavior',
]);

/** The worlds a row can run in: each instance with rows of its own, then every other world. */
async function worldsOf({ CyberiaEntityTypeDefault, CyberiaInstanceConf }) {
  const [confs, global] = await Promise.all([
    CyberiaInstanceConf.find({ 'entityDefaults.0': { $exists: true } }, { instanceCode: 1, entityDefaults: 1 }).lean(),
    findGlobalDefaults({ CyberiaEntityTypeDefault, CyberiaInstanceConf }),
  ]);
  const referenced = new Map(
    (
      await CyberiaEntityTypeDefault.find({
        _id: { $in: confs.flatMap(({ entityDefaults }) => entityDefaults) },
      }).lean()
    ).map((doc) => [String(doc._id), doc]),
  );
  const { baseline } = contentArtifact();
  const order = (instance) => runtimeEntityDefaults({ instance, baseline, global }).map(({ row }) => row);
  return [
    ...confs.map(({ instanceCode, entityDefaults }) => ({
      instanceCode,
      rowIds: entityDefaults.map(String),
      rows: order(entityDefaults.map((id) => referenced.get(String(id))).filter(Boolean)),
    })),
    { instanceCode: null, rowIds: [], rows: order([]) },
  ];
}

/**
 * Where a row runs and which rows run in its place: in each world it reaches, the row an entity of
 * its exact build resolves to.
 */
function runtimeOf(doc, worlds) {
  const id = String(doc._id);
  const instances = worlds.filter(({ rowIds }) => rowIds.includes(id)).map(({ instanceCode }) => instanceCode);
  const reached = instances.length > 0 ? worlds.filter(({ instanceCode }) => instances.includes(instanceCode)) : worlds;
  const shadowedBy = reached.flatMap(({ instanceCode, rows }) => {
    const winner = resolveEntityDefaultBuild({ entityType: doc.entityType, itemIds: doc.liveItemIds }, rows);
    return winner && String(winner._id) !== id ? [{ instanceCode, rowId: winner._id ? String(winner._id) : '' }] : [];
  });
  return { instances, shadowedBy };
}

/**
 * The workspace of a population: its rows with what each stores, the staged items each names (none
 * for a row a moderator added), where it runs and which rows run in its place; the artwork of each
 * live, dead and drop item of a row ({@link itemArtwork}); the staged items no row names, with the
 * entity type a new row of each takes; and the rows removed from the workspace.
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
  const [docs, worlds, removedDocs] = await Promise.all([
    models.CyberiaEntityTypeDefault.find({
      $or: [...ARTWORK_LISTS.map((list) => ({ [list]: { $in: staged } })), { _id: { $in: added } }],
    })
      .sort({ entityType: 1, _id: 1 })
      .lean(),
    worldsOf(models),
    models.CyberiaEntityTypeDefault.find({ _id: { $in: removed } }, { entityType: 1, liveItemIds: 1 }).lean(),
  ]);
  const rows = docs
    .filter((doc) => !hidden.has(String(doc._id)))
    .map((doc) => {
      const itemIds = staged.filter((itemId) => drawnBy(doc).includes(itemId));
      return {
        rowId: String(doc._id),
        updatedAt: doc.updatedAt,
        ...Object.fromEntries(ROW_FIELDS.map((field) => [field, doc[field] ?? (field === 'behavior' ? '' : [])])),
        itemIds,
        added: itemIds.length === 0,
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
