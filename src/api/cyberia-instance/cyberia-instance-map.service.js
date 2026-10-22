// The instance map serves authored topology and capabilities. AOI owns live stats.

import { CyberiaEntityTypeDefaultService } from '../cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { refreshMapPreview } from '../../projects/cyberia/instance/map-preview-generator.js';
import { worldPreview } from '../../projects/cyberia/instance/world-preview.js';
import { instanceMapLayout } from '../../projects/cyberia/instance/instance-map-layout.js';
import { entrySpawn } from '../../projects/cyberia/instance/entry-spawn.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { apiPathOf } from '../../server/domain/api-contract.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  effectiveStatsSum,
  resolveEntityDefaultBuild,
  resolveProgressionRules,
  resolveSpawnLoadout,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';
import { catalogModels, findBoundDefinitions } from '../../projects/cyberia/catalog/object-layer-catalog.js';
import { contentArtifact } from '../../projects/cyberia/content/content-artifact.js';
import { parseRgba } from '../../projects/cyberia/instance-data.js';
import { isImmortalBehavior, resolveGraphLayout } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

const actionHasStandalonePayload = (action) =>
  (action.shopItems || []).length > 0 || (action.craftRecipes || []).length > 0 || (action.storageSlots || 0) > 0;

// The services an action configures, in the order the map lists them. A configured service is
// not an open one: the client and the server still apply their own rules.
const ACTION_SERVICES = Object.freeze([
  ['shop', (action) => (action.shopItems || []).length > 0],
  ['craft', (action) => (action.craftRecipes || []).length > 0],
  ['storage', (action) => (action.storageSlots || 0) > 0],
  ['market', (action) => Boolean(action.market?.marketCode)],
  ['buyback', (action) => (action.buybackItems || []).length > 0],
  ['burn', (action) => (action.burnItems || []).length > 0],
  ['talk', (action) => Boolean(action.dialogCode)],
]);

const actionServices = (action) =>
  ACTION_SERVICES.filter(([, configured]) => configured(action)).map(([service]) => service);

// A random mode lands anywhere on the target map: the server drops the target cell, so the graph does too.
const portalTargetCell = (portal) =>
  String(portal.portalMode || '').includes('random')
    ? { x: -1, y: -1 }
    : { x: portal.targetCellX ?? -1, y: portal.targetCellY ?? -1 };

const PRESENCE_STATUS = Object.freeze({
  passive: 'passive',
  hostile: 'hostile',
  resource: 'resource',
  portal: 'portal',
  portalRandom: 'portal-random',
});

const PRESENCE_PRIORITY = Object.freeze({
  [PRESENCE_STATUS.passive]: 1,
  [PRESENCE_STATUS.resource]: 2,
  [PRESENCE_STATUS.hostile]: 3,
  [PRESENCE_STATUS.portal]: 4,
  [PRESENCE_STATUS.portalRandom]: 5,
});

const CAPABILITY_ACTION = 'action';
const CAPABILITY_QUEST = 'quest';

const portalPresenceStatus = (portalMode) =>
  String(portalMode || '').includes('random') ? PRESENCE_STATUS.portalRandom : PRESENCE_STATUS.portal;

const entityPresenceStatus = (entity, objectLayerMetadata, behavior) => {
  switch (entity?.entityType) {
    case 'bot':
      if ('hostile' === behavior) return PRESENCE_STATUS.hostile;
      if (behavior) return PRESENCE_STATUS.passive;
      return (entity.objectLayerItemIds || []).some((itemId) => objectLayerMetadata[itemId]?.type === 'weapon')
        ? PRESENCE_STATUS.hostile
        : PRESENCE_STATUS.passive;
    case 'resource':
      return PRESENCE_STATUS.resource;
    case 'portal':
      return portalPresenceStatus(entity.portalSubtype);
    default:
      return '';
  }
};

const entityDefaultRow = (entityDefault) => ({
  entityType: entityDefault.entityType || '',
  liveItemIds: [...(entityDefault.liveItemIds || [])],
  deadItemIds: [...(entityDefault.deadItemIds || [])],
  dropItemIds: [...(entityDefault.dropItemIds || [])],
  inventoryItemsIds: [...(entityDefault.inventoryItemsIds || [])],
  overrideItemsIdsState: [...(entityDefault.overrideItemsIdsState || [])],
  behavior: entityDefault.behavior || '',
});

const mergeEntityDefaults = (entityDefaults = []) => {
  const merged = entityDefaults.map(entityDefaultRow);
  const coveredTypes = new Set(merged.map((entityDefault) => entityDefault.entityType));
  for (const canonical of contentArtifact().baseline) {
    if (!coveredTypes.has(canonical.entityType)) merged.push(entityDefaultRow(canonical));
  }
  return merged;
};

// What the server makes of one placed entity at spawn, from the build it matches: its presence class,
// the skin it wears, the resource item it is, whether a player can kill it, what it drops on death,
// and its stat sum. Placed state only: never a live value.
const placement = (entity, objectLayerMetadata, rules) => {
  const build = resolveEntityDefaultBuild(
    { entityType: entity.entityType, itemIds: entity.objectLayerItemIds },
    rules.entityDefaults,
  );
  const behavior = build?.behavior || '';
  const itemTypes = Object.fromEntries(Object.entries(objectLayerMetadata).map(([itemId, { type }]) => [itemId, type]));
  const layers = resolveSpawnLoadout(
    { itemIds: entity.objectLayerItemIds || [], seedDefaults: 0 === parseRgba(entity.color).a },
    build,
    { itemTypes, maxActiveLayers: rules.maxActiveLayers },
  );
  const worn = layers.filter(({ active }) => active).map(({ itemId }) => itemId);
  return {
    presence: entityPresenceStatus(entity, objectLayerMetadata, behavior),
    skin: worn.find((itemId) => itemTypes[itemId] === 'skin') || '',
    item: entity.entityType === 'resource' ? worn.find((itemId) => itemTypes[itemId] === 'resource') || '' : '',
    mortal: !isImmortalBehavior(behavior),
    drops: build?.dropItemIds || [],
    stats: effectiveStatsSum(layers, {
      level: entity.level,
      rules: rules.progressionRules,
      statsOf: (itemId) => objectLayerMetadata[itemId]?.stats,
    }),
  };
};

// The placements of each map, by map code, in entity order: one resolution for the marks, the counts,
// the labels and the objective targets.
const mapPlacements = (maps, objectLayerMetadata, rules) =>
  new Map(
    maps.map((map) => [map.code, (map.entities || []).map((entity) => placement(entity, objectLayerMetadata, rules))]),
  );

// The bots and resources the content places on a map: its steady population, never a live count.
const placedCounts = (placements = []) => ({
  hostile: placements.filter(({ presence }) => presence === PRESENCE_STATUS.hostile).length,
  passive: placements.filter(({ presence }) => presence === PRESENCE_STATUS.passive).length,
  resource: placements.filter(({ presence }) => presence === PRESENCE_STATUS.resource).length,
});

// An item a cell gives, and how: dropped by what is placed there, sold or assembled by its action.
const YIELD_VIA = Object.freeze({ drop: 'drop', shop: 'shop', craft: 'craft' });

const addUnique = (list, row, same) => {
  if (!list.some((entry) => same(entry, row))) list.push(row);
};

const resolveObjectLayerMetadata = async (itemIds, options) => {
  if (!itemIds.length) return {};

  let models;
  try {
    models = catalogModels(options);
  } catch {
    return {};
  }
  const objectLayers = await findBoundDefinitions(models, itemIds);
  return Object.fromEntries(
    objectLayers.map((layer) => [layer.data.item.id, { type: layer.data.item.type, stats: layer.data.stats }]),
  );
};

// The rules a world spawns its entities by. Only what this instance references: the conf names its
// entity-type defaults by _id, so a POI never reads behavior out of another world's wiring.
const worldRules = (conf = {}, entityDefaults = []) => ({
  entityDefaults: mergeEntityDefaults(entityDefaults),
  progressionRules: resolveProgressionRules(conf.progressionRules || {}),
  maxActiveLayers: conf.maxActiveLayers ?? CYBERIA_INSTANCE_CONF_DEFAULTS.maxActiveLayers,
});

const resolveWorldRules = async (instance, options) => {
  try {
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const conf = await CyberiaInstanceConf.findOne({ instanceCode: instance.code })
      .select('entityDefaults progressionRules maxActiveLayers')
      .lean();
    return worldRules(conf || {}, await CyberiaEntityTypeDefaultService.resolve(conf?.entityDefaults, options));
  } catch {
    return worldRules();
  }
};

const buildPresencePois = ({ instance, maps, quests, actions, placements }) => {
  const pois = new Map();

  const getPoi = (mapCode, cellX, cellY, presenceStatus, sourcePriority = 0) => {
    if (!mapCode || !Number.isFinite(cellX) || !Number.isFinite(cellY) || cellX < 0 || cellY < 0 || !presenceStatus)
      return null;
    const key = `${mapCode}:${cellX}:${cellY}`;
    const existing = pois.get(key);
    const poi = existing || {
      mapCode,
      cellX,
      cellY,
      presenceStatus,
      capabilities: [],
      quests: [],
      actions: [],
      bots: [],
      resources: [],
      yields: [],
      sourcePriority,
    };
    const priority = sourcePriority + (PRESENCE_PRIORITY[presenceStatus] || 0);
    const currentPriority = poi.sourcePriority + (PRESENCE_PRIORITY[poi.presenceStatus] || 0);
    if (priority > currentPriority) {
      poi.presenceStatus = presenceStatus;
      poi.sourcePriority = sourcePriority;
    }
    pois.set(key, poi);
    return poi;
  };

  const addCapability = (poi, capability) => {
    if (poi && !poi.capabilities.includes(capability)) poi.capabilities.push(capability);
  };
  const addYield = (poi, itemId, via) =>
    itemId && addUnique(poi.yields, { itemId, via }, (a, b) => a.itemId === b.itemId && a.via === b.via);

  // A bot is a `talk` target by its skin, and a `kill` target when mortal; what a bot or a
  // resource drops is a `collect` source. Each names its stat sum as placed.
  for (const map of maps) {
    (map.entities || []).forEach((entity, i) => {
      const { presence, skin, item, mortal, drops, stats } = placements.get(map.code)[i];
      const poi = presence && getPoi(map.code, entity.initCellX, entity.initCellY, presence, 100);
      if (!poi) return;
      if (entity.entityType === 'bot' && skin)
        addUnique(
          poi.bots,
          { skin, mortal, stats },
          (a, b) => a.skin === b.skin && a.mortal === b.mortal && a.stats === b.stats,
        );
      if (item)
        addUnique(poi.resources, { itemId: item, stats }, (a, b) => a.itemId === b.itemId && a.stats === b.stats);
      for (const itemId of drops) addYield(poi, itemId, YIELD_VIA.drop);
    });
  }

  // Portal-cell presence follows the AOI: the portal's own outgoing edge
  // decides random against fixed, and priority 200 beats the authored entity
  // class. A fixed-cell target endpoint is only a plain portal POI; its own
  // outgoing edge stamps the mode.
  for (const portal of instance.portals || []) {
    getPoi(
      portal.sourceMapCode,
      portal.sourceCellX ?? -1,
      portal.sourceCellY ?? -1,
      portalPresenceStatus(portal.portalMode),
      200,
    );
    const target = portalTargetCell(portal);
    getPoi(portal.targetMapCode, target.x, target.y, PRESENCE_STATUS.portal);
  }

  // The client marks a quest or action POI active from its own quest state: a quest is actionable
  // while active, or acceptable once its prerequisites are complete; an action while it carries a
  // standalone payload or fronts an actionable quest.
  for (const quest of quests) {
    const poi = getPoi(quest.sourceMapCode, quest.sourceCellX ?? 0, quest.sourceCellY ?? 0, PRESENCE_STATUS.passive);
    addCapability(poi, CAPABILITY_QUEST);
    poi?.quests.push({
      code: quest.code,
      title: quest.title || quest.code,
      prerequisiteCodes: [...(quest.prerequisiteCodes || [])],
    });
  }

  for (const action of actions) {
    const poi = getPoi(action.sourceMapCode, action.sourceCellX ?? 0, action.sourceCellY ?? 0, PRESENCE_STATUS.passive);
    addCapability(poi, CAPABILITY_ACTION);
    if (!poi) continue;
    poi.actions.push({
      code: action.code,
      label: action.label || '',
      questCodes: (action.questDialogueCodes || []).map((qd) => qd.questCode),
      standalone: actionHasStandalonePayload(action),
      services: actionServices(action),
    });
    for (const { itemId } of action.shopItems || []) addYield(poi, itemId, YIELD_VIA.shop);
    for (const recipe of action.craftRecipes || [])
      for (const { itemId } of recipe.outputItems || []) addYield(poi, itemId, YIELD_VIA.craft);
  }

  return [...pois.values()]
    .map(({ sourcePriority, ...poi }) => poi)
    .sort(
      (left, right) =>
        left.mapCode.localeCompare(right.mapCode) || left.cellY - right.cellY || left.cellX - right.cellX,
    );
};

/**
 * Pure payload builder for the static graph. `world` matches the
 * resolveInstanceWorld shape: { instance, maps, quests, actions,
 * objectLayerMetadata, rules }.
 */
const buildStaticPayload = ({ instance, maps, quests, actions, objectLayerMetadata = {}, rules = worldRules() }) => {
  const previewRoute = (mapCode) =>
    `${apiPathOf()}/cyberia-instance/instance-map/${encodeURIComponent(instance.code)}/preview/${encodeURIComponent(mapCode)}`;

  // Nodes follow the instance order, so the default cells never depend on the read order.
  const mapByCode = new Map(maps.map((m) => [m.code, m]));
  const ordered = (instance.cyberiaMapCodes || [])
    .filter((code) => mapByCode.has(code))
    .map((code) => mapByCode.get(code));
  const layout = resolveGraphLayout(
    ordered.map((m) => m.code),
    instance.mapLayout || [],
    'mapCode',
  );
  const { nodes: positions } = instanceMapLayout(ordered, layout);
  const placements = mapPlacements(maps, objectLayerMetadata, rules);
  const nodes = ordered.map((m, i) => ({
    mapCode: m.code,
    name: m.name || m.code,
    x: layout[i].x,
    y: layout[i].y,
    // The size of the map: one scale for every map of the world, its longest map side 1.
    w: positions[i].w,
    h: positions[i].h,
    // The centre of a map with a world origin, at the scale of `w`, `h`; null without one.
    world: positions[i].world,
    position: { x: positions[i].x, y: positions[i].y },
    gridX: m.gridX,
    gridY: m.gridY,
    // File id of the map's auto-captured Object Layer render (persisted maps).
    preview: m.preview ? String(m.preview) : '',
    // Path of the node background. A captured File is served directly. Without
    // one the client hits the preview route, which renders on demand and stores
    // the result as the map's `preview` File.
    previewUrl: m.preview ? `${apiPathOf()}/file/blob/${String(m.preview)}` : previewRoute(m.code),
    placed: placedCounts(placements.get(m.code)),
  }));

  const edges = (instance.portals || []).map((p) => {
    const target = portalTargetCell(p);
    return {
      sourceMapCode: p.sourceMapCode,
      sourceCellX: p.sourceCellX ?? -1,
      sourceCellY: p.sourceCellY ?? -1,
      targetMapCode: p.targetMapCode,
      targetCellX: target.x,
      targetCellY: target.y,
      portalMode: p.portalMode || 'inter-portal',
    };
  });

  return {
    instanceCode: instance.code,
    name: instance.name || instance.code,
    description: instance.description || '',
    topologyMode: instance.topologyMode || 'manual',
    entrySpawn: entrySpawn(instance, ordered),
    nodes,
    edges,
    presencePois: buildPresencePois({ instance, maps, quests, actions, placements }),
  };
};

/**
 * Resolve the content-authority view of an instance: its map nodes plus the
 * quests and actions bound to those maps.
 */
const resolveInstanceWorld = async (instanceCode, options) => {
  const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
  const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);

  const instance = await CyberiaInstance.findOne({ code: instanceCode }).lean();
  if (!instance) throw new Error(`CyberiaInstance "${instanceCode}" not found`);

  const mapCodes = instance.cyberiaMapCodes || [];
  const [maps, quests, actions] = await Promise.all([
    CyberiaMap.find({ code: { $in: mapCodes } })
      .select('code name gridX gridY worldX worldY preview entities')
      .lean(),
    CyberiaQuest.find({ sourceMapCode: { $in: mapCodes } })
      .select('code title prerequisiteCodes sourceMapCode sourceCellX sourceCellY')
      .lean(),
    CyberiaAction.find({ sourceMapCode: { $in: mapCodes } })
      .select(
        'code label sourceMapCode sourceCellX sourceCellY dialogCode questDialogueCodes shopItems craftRecipes ' +
          'storageSlots buybackItems burnItems market',
      )
      .lean(),
  ]);

  // One metadata read covers what the content places and what the defaults carry: a worn item can come from either.
  const rules = await resolveWorldRules(instance, options);
  const itemIds = [
    ...new Set([
      ...maps.flatMap((map) => (map.entities || []).flatMap((entity) => entity.objectLayerItemIds || [])),
      ...rules.entityDefaults.flatMap((entityDefault) => [
        ...entityDefault.liveItemIds,
        ...entityDefault.deadItemIds,
        ...entityDefault.dropItemIds,
        ...entityDefault.inventoryItemsIds,
      ]),
    ]),
  ];
  const objectLayerMetadata = await resolveObjectLayerMetadata(itemIds, options);

  return { instance, maps, quests, actions, objectLayerMetadata, rules };
};

class CyberiaInstanceMapService {
  static getStatic = async (req, res, options) => {
    const { instanceCode } = req.params;
    if (!instanceCode) throw new Error('instanceCode parameter is required');
    const world = await resolveInstanceWorld(instanceCode, options);
    return buildStaticPayload(world);
  };

  /**
   * Node-background PNG for one map.
   *
   * A map without a stored `preview` File is drawn once and the picture becomes
   * its preview, so every later request is served through the default
   * /api/v1/file/blob path.
   */
  static getPreview = async (req, res, options) => {
    const { mapCode } = req.params;
    if (!mapCode) throw new Error('mapCode parameter is required');

    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
    const File = DataBaseProviderService.getModel('File', options);
    const map = await CyberiaMap.findOne({ code: mapCode }).select('code gridX gridY preview entities').lean();
    if (!map) throw new Error(`CyberiaMap "${mapCode}" not found`);

    // Another request may have persisted it between the payload and this hit.
    if (map.preview) {
      const stored = await File.findOne({ _id: map.preview });
      if (stored?.data) return stored.data;
    }

    const rendered = await refreshMapPreview(map, options);
    if (!rendered) throw new Error(`No preview for map "${mapCode}"`);
    logger.info(`map preview persisted for "${mapCode}"`);
    return rendered;
  };

  /** The preview of a world: its maps on their cells, keyed by both. */
  static getWorldPreview = async (req, res, options) => await worldPreview(req.params.instanceCode, options);
}

export { CyberiaInstanceMapService, buildStaticPayload };
