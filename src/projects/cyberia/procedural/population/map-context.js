/**
 * The map context of a population: what one map needs, read once and frozen into the population.
 *
 * A target is one item id a stage generates for. The foundation composition of the map and the
 * entities placed on it name targets, merged by item id; a moderator adds more. A map with no placed
 * entity is a valid start. The item type and the entity type decide the stage, by the shared runtime
 * vocabulary. A target counts its placements and what the foundation expects; it is one target
 * however often the map places it.
 *
 * Each target takes one resolution:
 *
 * | resolution | the candidate                                                                  |
 * | ---------- | ------------------------------------------------------------------------------ |
 * | `keep`     | none: the item keeps the binding observed when the moderator kept it           |
 * | `render`   | starts from the current render of the item                                     |
 * | `template` | starts from a Genesis Template: it replaces the current artwork, or is a new item |
 * | `author`   | none: a definition a moderator authors by hand becomes the item                |
 *
 * The catalog binds an item id for every map, so the context also reads where else each target
 * runs: its impact.
 *
 * | impact   | the target runs                                                     |
 * | -------- | ------------------------------------------------------------------- |
 * | `local`  | on this map only                                                    |
 * | `shared` | on other maps of the same biome too                                 |
 * | `global` | on a map of another biome, a map with no biome, or on a player      |
 *
 * @module src/projects/cyberia/procedural/population/map-context.js
 * @namespace CyberiaPopulationMapContext
 */
import { DataBaseProviderService } from '../../../../db/DataBaseProvider.js';
import { POPULATION_VERSION } from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  ITEM_TYPES,
} from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { renderedCids } from '../../catalog/object-layer-catalog.js';
import { contentArtifact, contentFreshness } from '../../content/content-artifact.js';
import { mapContext } from '../../content/foundation-context.js';
import { proceduralModels, requestError } from '../engine.js';
import { ITEM_ID_PATTERN } from '../spec.js';
import { itemSupport, recommendedOf, resolutionsOf } from './resolution.js';
import { STAGES, stageOf } from './stages.js';

/** Where a target comes from. */
export const TARGET_SOURCES = Object.freeze(['foundation', 'placement', 'manual']);

/** The entity types whose item lists name what a player wears or carries. */
const PLAYER_TYPES = Object.freeze([ENTITY_TYPES.player, ENTITY_TYPES.other_player]);
const ITEM_LISTS = Object.freeze(['liveItemIds', 'deadItemIds', 'dropItemIds', 'inventoryItemsIds']);

/**
 * The models a population reads: the procedural ones, the maps, the instances, their confs and the
 * entity-type defaults.
 * @param {{host:string,path:string}} options - Router options.
 * @returns {Object<string,import('mongoose').Model>}
 * @memberof CyberiaPopulationMapContext
 */
export const populationModels = (options) => ({
  ...proceduralModels(options),
  ...Object.fromEntries(
    ['CyberiaMap', 'CyberiaInstance', 'CyberiaInstanceConf', 'CyberiaEntityTypeDefault'].map((name) => [
      name,
      DataBaseProviderService.getModel(name, options),
    ]),
  ),
});

/** The served content artifact, or null where the host holds none. */
const contentIndex = () => {
  try {
    return contentArtifact();
  } catch {
    return null;
  }
};

/** The foundation definition of a map, or null. */
const definitionOf = (code, artifact) => artifact?.context.definitions[`map.${code}`] ?? null;

/** The biome the foundation gives a map, or null. */
const biomeOfMap = (code, artifact) => {
  const id = definitionOf(code, artifact)?.biome;
  const biome = id && artifact.context.definitions[id];
  return biome ? { id, name: biome.name, slug: id.slice(id.indexOf('.') + 1) } : null;
};

/**
 * A page of map summaries: identity, grid, placed entities, instances, biome, the size of the
 * foundation composition, and the state of the latest population of each map. The filter and the
 * sort apply to `code`, `name`, `revision`, `entityCount` and `updatedAt`.
 * @param {Object} models - {@link populationModels}.
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaPopulationMapContext
 */
export async function listMapSummaries({ CyberiaMap, CyberiaInstance, CyberiaProceduralPopulation }, page) {
  const { query, sort, skip, limit } = page;
  const [{ data, total }] = await CyberiaMap.aggregate([
    {
      $project: {
        _id: 0,
        code: 1,
        name: 1,
        revision: 1,
        gridX: 1,
        gridY: 1,
        updatedAt: 1,
        entityCount: { $size: '$entities' },
      },
    },
    { $match: query },
    {
      $facet: {
        data: [{ $sort: Object.keys(sort).length > 0 ? sort : { code: 1 } }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
    { $project: { data: 1, total: { $ifNull: [{ $arrayElemAt: ['$total.count', 0] }, 0] } } },
  ]);
  const codes = data.map(({ code }) => code);
  const [instances, populations] = await Promise.all([
    CyberiaInstance.find({ cyberiaMapCodes: { $in: codes } }, { _id: 0, name: 1, code: 1, cyberiaMapCodes: 1 }).lean(),
    CyberiaProceduralPopulation.aggregate([
      { $match: { mapCode: { $in: codes } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$mapCode',
          id: { $first: '$_id' },
          version: { $first: '$version' },
          cancelledAt: { $first: '$cancelledAt' },
          committed: { $first: '$publication.commit' },
        },
      },
    ]),
  ]);
  const artifact = contentIndex();
  const latest = new Map(populations.map((entry) => [entry._id, entry]));
  return {
    data: data.map((row) => {
      const population = latest.get(row.code);
      return {
        ...row,
        biome: biomeOfMap(row.code, artifact)?.name ?? '',
        composition: definitionOf(row.code, artifact)?.composition.length ?? 0,
        instances: instances
          .filter(({ cyberiaMapCodes }) => cyberiaMapCodes.includes(row.code))
          .map(({ name, code }) => name || code),
        population: population && {
          id: String(population.id),
          state:
            population.version !== POPULATION_VERSION
              ? 'outdated'
              : population.cancelledAt
                ? 'cancelled'
                : population.committed
                  ? 'published'
                  : 'open',
        },
      };
    }),
    total,
  };
}

/** The item ids a player entity-type default carries, here or in the content baseline. */
async function playerItems({ CyberiaEntityTypeDefault }, itemIds) {
  const carried = (defaults) =>
    defaults.flatMap((entry) => ITEM_LISTS.flatMap((list) => entry[list] ?? [])).filter((id) => itemIds.includes(id));
  const stored = await CyberiaEntityTypeDefault.find(
    { entityType: { $in: PLAYER_TYPES }, $or: ITEM_LISTS.map((list) => ({ [list]: { $in: itemIds } })) },
    Object.fromEntries(ITEM_LISTS.map((list) => [list, 1])),
  ).lean();
  const baseline = (contentIndex()?.baseline ?? []).filter(({ entityType }) => PLAYER_TYPES.includes(entityType));
  return new Set([...carried(stored), ...carried(baseline)]);
}

/**
 * Where each target runs besides one map, and the impact a new definition of it has.
 * @param {Object} models
 * @param {string[]} itemIds
 * @param {{mapCode:string,biomeId:string|null}} map - The map of the population and its biome.
 * @returns {Promise<Map<string,{maps:Object[],players:boolean,impact:'local'|'shared'|'global'}>>} By item id;
 *   `maps` are the other maps, each with its code, name, biome and placements.
 * @memberof CyberiaPopulationMapContext
 */
export async function targetUsage(models, itemIds, { mapCode, biomeId }) {
  const usage = new Map(itemIds.map((itemId) => [itemId, { maps: [], players: false, impact: 'local' }]));
  if (itemIds.length === 0) return usage;
  const [rows, players] = await Promise.all([
    models.CyberiaMap.aggregate([
      { $match: { code: { $ne: mapCode }, 'entities.objectLayerItemIds': { $in: itemIds } } },
      { $unwind: '$entities' },
      { $unwind: '$entities.objectLayerItemIds' },
      { $match: { 'entities.objectLayerItemIds': { $in: itemIds } } },
      {
        $group: {
          _id: { itemId: '$entities.objectLayerItemIds', code: '$code' },
          name: { $first: '$name' },
          placements: { $sum: 1 },
        },
      },
      { $sort: { '_id.itemId': 1, '_id.code': 1 } },
    ]),
    playerItems(models, itemIds),
  ]);
  const artifact = contentIndex();
  for (const { _id, name, placements } of rows)
    usage.get(_id.itemId).maps.push({ code: _id.code, name, biome: biomeOfMap(_id.code, artifact), placements });
  for (const [itemId, entry] of usage) {
    entry.players = players.has(itemId);
    const elsewhere = entry.maps.some(({ biome }) => !biome || biome.id !== biomeId);
    entry.impact = entry.players || elsewhere ? 'global' : entry.maps.length > 0 ? 'shared' : 'local';
  }
  return usage;
}

/**
 * The item ids a map names: from its foundation composition and its placed entities, merged by item
 * id with the entity types that carry each, where each comes from and how often.
 * @param {{composition:Object[],entities:Object[]}} map
 * @returns {Map<string,{itemId:string,entityTypes:Set<string>,sources:Set<string>,foundation:Object[],placements:number}>}
 */
function namedItems({ composition, entities }) {
  const named = new Map();
  const entryOf = (itemId) => {
    if (!named.has(itemId))
      named.set(itemId, { itemId, entityTypes: new Set(), sources: new Set(), foundation: [], placements: 0 });
    return named.get(itemId);
  };
  for (const { id, name, count = 1, entity } of composition)
    for (const itemId of entity.objectLayerItemIds) {
      const entry = entryOf(itemId);
      entry.entityTypes.add(entity.entityType);
      entry.sources.add('foundation');
      entry.foundation.push({ id, name, count });
    }
  for (const { entityType, objectLayerItemIds } of entities)
    for (const itemId of objectLayerItemIds) {
      const entry = entryOf(itemId);
      entry.entityTypes.add(entityType);
      entry.sources.add('placement');
      entry.placements++;
    }
  return named;
}

/** The one item type of a list, or null. */
const soleType = (types) => (types.length === 1 ? types[0] : null);

/**
 * What a keep decision records of a binding: its CID and its revision.
 * @param {{cid:string,revision:number}} binding - An entry of `CyberiaItemCatalog.bindingsOf`.
 * @returns {{cid:string,bindingRevision:number}}
 */
export const observedOf = ({ cid, revision }) => ({ cid, bindingRevision: revision });

/**
 * The targets of item ids, each with its stage, sources, counts, binding, render and the
 * configuration it starts with: the recommended resolution, the first usable template, the palette
 * defaults of the item and no variation of its own.
 * @param {Object} models - {@link populationModels}.
 * @param {Array<{itemId:string,entityTypes?:Set<string>,sources:Set<string>,foundation?:Object[],placements?:number,stage?:string,itemType?:string,definitionCid?:string}>} entries
 * @returns {Promise<{targets:Object[],findings:Object[]}>}
 * @throws {Error} 400 for a manual target no stage takes.
 * @memberof CyberiaPopulationMapContext
 */
export async function resolveTargets(models, entries) {
  const findings = new Map();
  const find = (level, message, itemId) => findings.set(message, { level, message, ...(itemId && { itemId }) });
  const bindings = await models.CyberiaItemCatalog.bindingsOf(entries.map(({ itemId }) => itemId));
  const cids = [...new Set([...bindings.values()].map(({ cid }) => cid))];
  const selected = entries.map(({ definitionCid }) => definitionCid).filter(Boolean);
  const [definitions, rendered, support] = await Promise.all([
    models.ObjectLayer.find({ cid: { $in: [...cids, ...selected] } }, { cid: 1, 'data.item.type': 1 }).lean(),
    renderedCids(models, cids),
    itemSupport(models),
  ]);
  const typeOf = new Map(definitions.map(({ cid, data }) => [cid, data.item.type]));
  const contentType = (itemId) => contentIndex()?.byItemId.get(itemId)?.payload.data.item.type;
  const targets = [];
  for (const entry of [...entries].sort((left, right) => (left.itemId < right.itemId ? -1 : 1))) {
    const { itemId, definitionCid = '' } = entry;
    const manual = entry.sources.has('manual');
    const cid = bindings.get(itemId)?.cid ?? null;
    const named = entry.stage ? stageOf(entry.stage) : null;
    const known = (cid && typeOf.get(cid)) || typeOf.get(definitionCid) || contentType(itemId);
    if (manual && !known && !ITEM_ID_PATTERN.test(itemId))
      throw requestError(`The new item id ${itemId} is not lowercase words joined by hyphens`);
    if (manual && entry.itemType && !Object.values(ITEM_TYPES).includes(entry.itemType))
      throw requestError(`${entry.itemType} is not a Cyberia item type`);
    const entityTypes = [...(entry.entityTypes ?? [])];
    const placedType =
      entityTypes.length > 0 && entityTypes.every((type) => ENTITY_TYPE_TO_ITEM_TYPES[type].length === 1)
        ? soleType([...new Set(entityTypes.flatMap((type) => ENTITY_TYPE_TO_ITEM_TYPES[type]))])
        : null;
    const itemType = known || entry.itemType || (named && soleType(named.itemTypes)) || placedType;
    const refused = entityTypes.find((type) => itemType && !ENTITY_TYPE_TO_ITEM_TYPES[type]?.includes(itemType));
    if (refused) find('blocker', `A ${refused} carries ${itemId}, a ${itemType} item it does not take`, itemId);
    if (named && itemType && !named.itemTypes.includes(itemType))
      throw requestError(
        `${itemId} is a ${itemType} item: stage ${named.id} takes ${named.itemTypes.join(', ')} items`,
      );
    const placedBy = (stage) =>
      entityTypes.length === 0 || entityTypes.some((type) => stage.entityTypes.includes(type));
    const stage =
      named ??
      (itemType ? STAGES.find((candidate) => candidate.itemTypes.includes(itemType) && placedBy(candidate)) : null);
    if (!stage || !itemType) {
      if (manual)
        throw requestError(
          stage ? `Name the item type of the new item ${itemId}` : `Name the stage of the new item ${itemId}`,
        );
      if (!itemType) find('action', `${itemId} is not a Cyberia item here: add it by hand with its stage`, itemId);
      continue;
    }
    const hasRender = rendered.has(cid);
    const { usable } = support[stage.id][itemType];
    const binding = bindings.get(itemId) ?? null;
    const resolution = recommendedOf(
      { hasRender, definitionCid },
      resolutionsOf({ itemType, cid, hasRender, binding }, support[stage.id][itemType]),
    );
    if (usable.length === 0)
      find(
        'info',
        `${stage.generatorId ? `No ${itemType} Genesis Template serves ${itemId}` : `No generator draws ${itemType} items`}: ${cid ? `${itemId} keeps its current artwork` : `author ${itemId} by hand`}`,
        itemId,
      );
    targets.push({
      itemId,
      itemType,
      stage: stage.id,
      sources: TARGET_SOURCES.filter((source) => entry.sources.has(source)),
      foundation: entry.foundation ?? [],
      expected: entry.foundation?.length ? entry.foundation.reduce((sum, { count }) => sum + count, 0) : null,
      placements: entry.placements ?? 0,
      cid,
      hasRender,
      resolution,
      templateId: usable[0] ?? '',
      definitionCid,
      observed: resolution === 'keep' ? observedOf(binding) : null,
      palette: { slots: {} },
      variation: null,
      drafts: [],
    });
  }
  return { targets, findings: [...findings.values()] };
}

/**
 * The map context of a population: the map, the instances that run it, its foundation definition,
 * biome, palettes and composition, the targets its composition and placements name, whether the
 * served content is behind the content checkout, and the findings: `blocker` stops a target or the
 * map, `action` asks for a choice, `info` informs.
 * @param {Object} models - {@link populationModels}.
 * @param {string} code - Map code.
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown map.
 * @memberof CyberiaPopulationMapContext
 */
export async function resolveMapContext(models, code) {
  const map = await models.CyberiaMap.findOne(
    { code },
    {
      code: 1,
      name: 1,
      description: 1,
      revision: 1,
      gridX: 1,
      gridY: 1,
      cellWidth: 1,
      cellHeight: 1,
      'entities.entityType': 1,
      'entities.objectLayerItemIds': 1,
    },
  ).lean();
  if (!map) throw requestError(`Map ${code} not found`, 404);
  const artifact = contentIndex();
  const definition = definitionOf(code, artifact);
  const biome = biomeOfMap(code, artifact);
  const foundation = artifact && definition ? mapContext({ code, map }, artifact.context) : null;
  const named = namedItems({ composition: foundation?.composition ?? [], entities: map.entities });
  const [instances, { targets, findings }] = await Promise.all([
    models.CyberiaInstance.find({ cyberiaMapCodes: code }, { _id: 0, code: 1, name: 1 }).sort({ code: 1 }).lean(),
    resolveTargets(models, [...named.values()]),
  ]);
  const content = artifact ? contentFreshness() : null;
  const notices = [
    ...(!artifact
      ? [{ level: 'blocker', message: 'This host serves no content artifact: it holds no Genesis Template' }]
      : []),
    ...(content?.stale
      ? [
          {
            level: 'action',
            message: `The served content is built from ${content.sourceRevision.slice(0, 7)}; the content checkout is at ${content.checkoutRevision.slice(0, 7)}. Build cyberia-content and release it to use its latest templates`,
          },
        ]
      : []),
    ...(artifact && !definition
      ? [{ level: 'info', message: `The foundation defines no map ${code}: add its targets by hand` }]
      : []),
    ...(definition && !biome?.id
      ? [{ level: 'info', message: 'The map has no biome: each target starts from its own colors' }]
      : []),
    ...(map.entities.length === 0
      ? [{ level: 'info', message: 'No placed entities yet: prepare the visual assets, then compose the map' }]
      : []),
  ];
  return {
    map: {
      code: map.code,
      name: map.name,
      description: map.description,
      revision: map.revision,
      grid: { gridX: map.gridX, gridY: map.gridY, cellWidth: map.cellWidth, cellHeight: map.cellHeight },
      entityCount: map.entities.length,
    },
    instances,
    foundation: definition
      ? { id: `map.${code}`, name: definition.name, entries: definition.composition.length }
      : null,
    biome,
    palettes: foundation?.palettes ?? [],
    contentDigest: artifact?.manifest.contentDigest ?? '',
    targets,
    findings: [...notices, ...findings],
  };
}
