/**
 * Instance Map service — strategic-graph REST payloads for the client's
 * expanded Instance Map modal.
 *
 * Serves two lightweight views of an instance, decoupled from the gameplay
 * AOI stream:
 *   static  — graph topology plus authored map-cell presence, capability
 *             membership, and baseline stats for living presence (bots and
 *             resources; portals carry none). Fetched once when the modal
 *             opens.
 *   dynamic — per-player capability activity. Polled while the modal is open.
 *
 * Live player position is intentionally absent: engine-cyberia holds no
 * real-time simulation state (see cyberia-docs/ARCHITECTURE.md). The client
 * overlays its own predicted position on the graph.
 *
 * @module src/api/cyberia-instance/cyberia-instance-map.service.js
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { generateFallbackWorld } from './cyberia-fallback-world.js';
import {
  cacheWorldMapPreviews,
  getCachedMapPreview,
  renderMapPreviewPng,
} from '../../projects/cyberia/map-preview-generator.js';
import { FileFactory } from '../file/file.service.js';
import { loggerFactory } from '../../server/logger.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  ENTITY_TYPE_DEFAULTS,
  RESOURCE_ENTITY_TYPE_DEFAULTS,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const logger = loggerFactory(import.meta);

const actionHasStandalonePayload = (action) =>
  (action.shopItems || []).length > 0 || (action.craftRecipes || []).length > 0 || (action.storageSlots || 0) > 0;

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

// Behaviors whose entities never carry the sum-stats readout (mission/action
// givers and fully static NPCs — mirrors the Go server's behavior semantics).
const STATLESS_BEHAVIORS = new Set(['provider', 'provider-static', 'static']);

const mergeEntityDefaults = (entityDefaults = []) => {
  const merged = entityDefaults.map((entityDefault) => ({
    entityType: entityDefault.entityType || '',
    liveItemIds: [...(entityDefault.liveItemIds || [])],
    behavior: entityDefault.behavior || '',
  }));
  const coveredTypes = new Set(merged.map((entityDefault) => entityDefault.entityType));
  for (const canonical of ENTITY_TYPE_DEFAULTS) {
    if (!coveredTypes.has(canonical.entityType)) {
      merged.push({
        entityType: canonical.entityType,
        liveItemIds: [...(canonical.liveItemIds || [])],
        behavior: canonical.behavior || '',
      });
    }
  }
  return merged;
};

// Mirrors game/entity_defaults.go: the most-specific live-item set wins, then
// the first build for the entity type supplies the runtime fallback behavior.
const entityBehavior = (entity, entityDefaults) => {
  const itemIds = new Set(entity.objectLayerItemIds || []);
  let firstTypeDefault;
  let matchedDefault;
  let matchedSize = 0;

  for (const entityDefault of entityDefaults) {
    if (entityDefault.entityType !== entity.entityType) continue;
    if (!firstTypeDefault) firstTypeDefault = entityDefault;
    const liveItemIds = entityDefault.liveItemIds || [];
    if (0 === itemIds.size || 0 === liveItemIds.length) continue;
    if (!liveItemIds.every((itemId) => itemIds.has(itemId))) continue;
    if (liveItemIds.length > matchedSize) {
      matchedDefault = entityDefault;
      matchedSize = liveItemIds.length;
    }
  }
  return (matchedDefault || firstTypeDefault)?.behavior || '';
};

const objectLayerStatsSum = (itemIds, objectLayerMetadata, sumStatsLimit) =>
  Math.min(
    (itemIds || []).reduce((sum, itemId) => sum + (objectLayerMetadata[itemId]?.statsSum || 0), 0),
    sumStatsLimit,
  );

const resolveObjectLayerMetadata = async (itemIds, options) => {
  if (!itemIds.length) return {};

  let ObjectLayer;
  try {
    ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
  } catch {
    return {};
  }
  const objectLayers = await ObjectLayer.find({ 'data.item.id': { $in: itemIds } })
    .select('data.item.id data.item.type data.stats')
    .lean();
  return Object.fromEntries(
    objectLayers.map((layer) => [
      layer.data.item.id,
      {
        statsSum: Object.values(layer.data.stats || {}).reduce((sum, value) => sum + (Number(value) || 0), 0),
        type: layer.data.item.type,
      },
    ]),
  );
};

const resolveSumStatsLimit = async (instance, options) => {
  const fallback = CYBERIA_INSTANCE_CONF_DEFAULTS.sumStatsLimit;
  let CyberiaInstanceConf;
  try {
    CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
  } catch {
    return fallback;
  }
  const conf = await CyberiaInstanceConf.findOne({ instanceCode: instance.code }).select('sumStatsLimit').lean();
  return Number.isFinite(conf?.sumStatsLimit) && conf.sumStatsLimit > 0 ? conf.sumStatsLimit : fallback;
};

const resolveEntityDefaults = async (instance, options) => {
  let configDefaults = [];
  try {
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const conf = await CyberiaInstanceConf.findOne({ instanceCode: instance.code }).select('entityDefaults').lean();
    configDefaults = conf?.entityDefaults || [];
  } catch {
    configDefaults = [];
  }

  try {
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const defaults = await CyberiaEntityTypeDefault.find({}).lean();
    if (defaults.length > 0) return mergeEntityDefaults(defaults);
  } catch {
    // The editable own-model collection is optional for legacy deployments.
  }
  return mergeEntityDefaults(configDefaults);
};

const buildPresencePois = ({
  instance,
  maps,
  quests,
  actions,
  objectLayerMetadata = {},
  entityDefaults = mergeEntityDefaults(),
  sumStatsLimit = CYBERIA_INSTANCE_CONF_DEFAULTS.sumStatsLimit,
}) => {
  const pois = new Map();

  const getPoi = (mapCode, cellX, cellY, presenceStatus, sourcePriority = 0, statsSum = 0, showStatsValue = false) => {
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
      sourcePriority,
      statsSum: 0,
      hasStatfulPresence: false,
      hasStatlessPresence: false,
    };
    if (sourcePriority >= 100) {
      if (showStatsValue) {
        poi.hasStatfulPresence = true;
        poi.statsSum += statsSum;
      } else {
        poi.hasStatlessPresence = true;
        poi.statsSum = 0;
      }
    }
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

  for (const map of maps) {
    for (const entity of map.entities || []) {
      const behavior = entityBehavior(entity, entityDefaults);
      const presenceStatus = entityPresenceStatus(entity, objectLayerMetadata, behavior);
      if (!presenceStatus) continue;
      // Stats travel only with living presence (bots and resources); portal
      // cells and provider/static-behavior entities never carry the readout.
      const statless =
        presenceStatus === PRESENCE_STATUS.portal ||
        presenceStatus === PRESENCE_STATUS.portalRandom ||
        STATLESS_BEHAVIORS.has(behavior);
      getPoi(
        map.code,
        entity.initCellX ?? 0,
        entity.initCellY ?? 0,
        presenceStatus,
        100,
        statless ? 0 : objectLayerStatsSum(entity.objectLayerItemIds, objectLayerMetadata, sumStatsLimit),
        !statless,
      );
    }
  }

  // Portal-cell presence mirrors the AOI: the portal's OWN outgoing edge
  // decides random vs fixed (priority 200 overrides the authored entity
  // classification, which may lack the runtime-assigned mode). Fixed-cell
  // TARGET endpoints only guarantee a plain portal POI — their real mode, if
  // any, is stamped by their own outgoing edge.
  for (const portal of instance.portals || []) {
    getPoi(
      portal.sourceMapCode,
      portal.sourceCellX ?? -1,
      portal.sourceCellY ?? -1,
      portalPresenceStatus(portal.portalMode),
      200,
    );
    getPoi(portal.targetMapCode, portal.targetCellX ?? -1, portal.targetCellY ?? -1, PRESENCE_STATUS.portal);
  }

  for (const quest of quests) {
    const poi = getPoi(quest.sourceMapCode, quest.sourceCellX ?? 0, quest.sourceCellY ?? 0, PRESENCE_STATUS.passive);
    addCapability(poi, CAPABILITY_QUEST);
  }

  for (const action of actions) {
    const poi = getPoi(action.sourceMapCode, action.sourceCellX ?? 0, action.sourceCellY ?? 0, PRESENCE_STATUS.passive);
    addCapability(poi, CAPABILITY_ACTION);
  }

  // Display permission is explicit: a statless entity must never become a
  // visible `stats 0` tab due to a numeric fallback or merged POI source.
  return [...pois.values()]
    .map(({ sourcePriority, hasStatfulPresence, hasStatlessPresence, ...poi }) => ({
      ...poi,
      statsSum: hasStatfulPresence && !hasStatlessPresence && poi.capabilities.length === 0 ? poi.statsSum : 0,
      showStatsValue: hasStatfulPresence && !hasStatlessPresence && poi.capabilities.length === 0,
    }))
    .sort(
      (left, right) =>
        left.mapCode.localeCompare(right.mapCode) || left.cellY - right.cellY || left.cellX - right.cellX,
    );
};

/**
 * Pure payload builder for the static graph. `world` matches the
 * resolveInstanceWorld shape: { instance, maps, quests, actions,
 * objectLayerMetadata, fallback }.
 */
const buildStaticPayload = ({
  instance,
  maps,
  quests,
  actions,
  fallback,
  objectLayerMetadata = {},
  entityDefaults = mergeEntityDefaults(),
  sumStatsLimit = CYBERIA_INSTANCE_CONF_DEFAULTS.sumStatsLimit,
  previewCachedMapCodes = new Set(),
}) => {
  const previewRoute = (mapCode) =>
    `/api/cyberia-instance/instance-map/${encodeURIComponent(instance.code)}/preview/${encodeURIComponent(mapCode)}`;

  const nodes = maps.map((m) => ({
    mapCode: m.code,
    name: m.name || m.code,
    gridX: m.gridX,
    gridY: m.gridY,
    // File id of the map's auto-captured Object Layer render (persisted maps).
    preview: m.preview ? String(m.preview) : '',
    // Ready-to-fetch path of the node background. A captured File is served
    // directly; otherwise the client hits the preview route, which renders on
    // demand — and for a persisted map also stores the result as its `preview`
    // File, so the next payload serves it through the default blob path.
    // Fallback-world maps only advertise the route once a render succeeded.
    previewUrl: m.preview
      ? `/api/file/blob/${String(m.preview)}`
      : fallback
        ? previewCachedMapCodes.has(m.code)
          ? previewRoute(m.code)
          : ''
        : previewRoute(m.code),
  }));

  const edges = (instance.portals || []).map((p) => ({
    sourceMapCode: p.sourceMapCode,
    sourceCellX: p.sourceCellX ?? -1,
    sourceCellY: p.sourceCellY ?? -1,
    targetMapCode: p.targetMapCode,
    targetCellX: p.targetCellX ?? -1,
    targetCellY: p.targetCellY ?? -1,
    portalMode: p.portalMode || 'inter-portal',
  }));

  return {
    instanceCode: instance.code,
    name: instance.name || instance.code,
    description: instance.description || '',
    topologyMode: instance.topologyMode || 'manual',
    fallback,
    nodes,
    edges,
    presencePois: buildPresencePois({
      instance,
      maps,
      quests,
      actions,
      objectLayerMetadata,
      entityDefaults,
      sumStatsLimit,
    }),
  };
};

/**
 * Provider state per quest: 'active' (in progress / turn-in target) or
 * 'acceptable' (prerequisites completed, never started). Locked and completed
 * quests are omitted — the map shows only actionable POIs.
 */
const classifyQuestProviders = (quests, progress) => {
  const completed = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.questCode));
  const active = new Set(progress.filter((p) => p.status === 'active').map((p) => p.questCode));

  const questProviders = [];
  for (const q of quests) {
    let state = '';
    if (active.has(q.code)) state = 'active';
    else if (!completed.has(q.code) && (q.prerequisiteCodes || []).every((c) => completed.has(c))) state = 'acceptable';
    if (!state) continue;
    questProviders.push({
      questCode: q.code,
      mapCode: q.sourceMapCode,
      cellX: q.sourceCellX ?? 0,
      cellY: q.sourceCellY ?? 0,
      state,
    });
  }
  return questProviders;
};

/**
 * An action provider is active when it fronts an actionable quest or carries
 * a standalone payload (shop, craft, storage) that is always usable.
 */
const classifyActionProviders = (actions, questProviders) => {
  const actionableQuestCodes = new Set(questProviders.map((qp) => qp.questCode));
  const actionProviders = [];
  for (const a of actions) {
    const questBound = (a.questDialogueCodes || []).some((qd) => actionableQuestCodes.has(qd.questCode));
    if (!questBound && !actionHasStandalonePayload(a)) continue;
    actionProviders.push({
      actionCode: a.code,
      mapCode: a.sourceMapCode,
      cellX: a.sourceCellX ?? 0,
      cellY: a.sourceCellY ?? 0,
      active: true,
    });
  }
  return actionProviders;
};

/**
 * Resolve the content-authority view of an instance: its map nodes plus the
 * quests/actions bound to those maps. Falls back to the in-memory procedural
 * world (and canonical default quests/actions) when the instance is not
 * persisted — mirroring the gRPC getFullInstance fallback that feeds
 * cyberia-server.
 */
const resolveInstanceWorld = async (instanceCode, options) => {
  const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
  const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);

  const instance = await CyberiaInstance.findOne({ code: instanceCode }).lean();

  if (!instance) {
    // Fallback world: generateFallbackWorld is deterministically seeded, so
    // this layout is identical to the one the gRPC path loads into the live
    // simulation AND to the one the /preview renderer draws — POIs, portals,
    // and resource cells all line up with the node preview image.
    const world = generateFallbackWorld();
    const mapCodes = new Set(world.instance.cyberiaMapCodes);

    // Build synthetic object-layer metadata for the fallback world's resource
    // items so resource entities carry a stats-sum readout.  The canonical
    // resource defaults (wood-1, wood-2) are not persisted to MongoDB in the
    // fallback path, so we compute a reasonable stats sum from the item type's
    // default stat block (each stat 0-10, 6 stats → ~30 average).
    const resourceItemIds = [
      ...new Set(RESOURCE_ENTITY_TYPE_DEFAULTS.flatMap((r) => [...(r.liveItemIds || []), ...(r.dropItemIds || [])])),
    ];
    const objectLayerMetadata = Object.fromEntries(
      resourceItemIds.map((itemId) => [itemId, { statsSum: 30, type: 'resource' }]),
    );

    return {
      instance: world.instance,
      maps: world.maps.map((m) => ({
        code: m.code,
        name: m.name || m.code,
        gridX: m.gridX,
        gridY: m.gridY,
        entities: m.entities || [],
      })),
      quests: DefaultCyberiaQuests.filter((q) => mapCodes.has(q.sourceMapCode)),
      actions: DefaultCyberiaActions.filter((a) => mapCodes.has(a.sourceMapCode)),
      objectLayerMetadata,
      entityDefaults: mergeEntityDefaults(),
      sumStatsLimit: CYBERIA_INSTANCE_CONF_DEFAULTS.sumStatsLimit,
      // The procedural world never passes through the browser editor, so its
      // node backgrounds are rendered here and served from the in-memory
      // preview cache (see instanceMapPreview).
      previewCachedMapCodes: new Set(await cacheWorldMapPreviews(instanceCode, world.maps)),
      fallback: true,
    };
  }

  const mapCodes = instance.cyberiaMapCodes || [];
  const [maps, dbQuests, dbActions] = await Promise.all([
    CyberiaMap.find({ code: { $in: mapCodes } })
      .select('code name gridX gridY preview entities')
      .lean(),
    CyberiaQuest.find({ sourceMapCode: { $in: mapCodes } })
      .select('code title prerequisiteCodes sourceMapCode sourceCellX sourceCellY')
      .lean(),
    CyberiaAction.find({ sourceMapCode: { $in: mapCodes } })
      .select('code label sourceMapCode sourceCellX sourceCellY questDialogueCodes shopItems craftRecipes storageSlots')
      .lean(),
  ]);

  const itemIds = [
    ...new Set(maps.flatMap((map) => (map.entities || []).flatMap((entity) => entity.objectLayerItemIds || []))),
  ];
  const objectLayerMetadata = await resolveObjectLayerMetadata(itemIds, options);
  const sumStatsLimit = await resolveSumStatsLimit(instance, options);
  const entityDefaults = await resolveEntityDefaults(instance, options);

  const codeSet = new Set(mapCodes);
  return {
    instance,
    maps,
    // Empty collections fall back to canonical defaults, matching the quest
    // getByCode behaviour for unseeded databases.
    quests: dbQuests.length > 0 ? dbQuests : DefaultCyberiaQuests.filter((q) => codeSet.has(q.sourceMapCode)),
    actions: dbActions.length > 0 ? dbActions : DefaultCyberiaActions.filter((a) => codeSet.has(a.sourceMapCode)),
    objectLayerMetadata,
    entityDefaults,
    sumStatsLimit,
    fallback: false,
  };
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
   * A persisted map with no captured `preview` is rendered once and the result
   * is stored as its preview File — not just cached — so every later request is
   * served through the default /api/file/blob path. The procedural fallback
   * world has no document to update and stays on the in-memory cache.
   */
  static getPreview = async (req, res, options) => {
    const { instanceCode, mapCode } = req.params;
    if (!instanceCode || !mapCode) throw new Error('instanceCode and mapCode parameters are required');

    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
    const File = DataBaseProviderService.getModel('File', options);
    const map = await CyberiaMap.findOne({ code: mapCode }).select('code gridX gridY preview entities').lean();

    if (map) {
      // Another request may have persisted it between the payload and this hit.
      if (map.preview) {
        const stored = await File.findOne({ _id: map.preview });
        if (stored?.data) return stored.data;
      }

      const rendered = await renderMapPreviewPng(map);
      if (rendered) {
        const file = await new File(FileFactory.create(rendered, `${mapCode}-preview.png`)).save();
        await CyberiaMap.updateOne({ _id: map._id }, { $set: { preview: file._id } });
        logger.info(`map preview persisted for "${mapCode}" (file ${file._id})`);
        return rendered;
      }
    }

    let png = getCachedMapPreview(instanceCode, mapCode);
    if (!png) {
      // Cold cache (first hit, or a restart since the modal last opened):
      // regenerate the world so the preview exists, then serve it.
      const { maps } = await resolveInstanceWorld(instanceCode, options);
      await cacheWorldMapPreviews(instanceCode, maps);
      png = getCachedMapPreview(instanceCode, mapCode);
    }
    if (!png) throw new Error(`No cached preview for map "${mapCode}"`);
    return png;
  };

  static getDynamic = async (req, res, options) => {
    const { instanceCode } = req.params;
    if (!instanceCode) throw new Error('instanceCode parameter is required');
    const playerId = typeof req.query?.playerId === 'string' ? req.query.playerId.trim() : '';

    const CyberiaQuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', options);
    const { quests, actions } = await resolveInstanceWorld(instanceCode, options);

    const progress = playerId ? await CyberiaQuestProgress.find({ playerId }).select('questCode status').lean() : [];

    const questProviders = classifyQuestProviders(quests, progress);
    const actionProviders = classifyActionProviders(actions, questProviders);

    return {
      instanceCode,
      playerId,
      questProviders,
      actionProviders,
      updatedAt: Date.now(),
    };
  };
}

export { CyberiaInstanceMapService, buildStaticPayload, classifyQuestProviders, classifyActionProviders };
