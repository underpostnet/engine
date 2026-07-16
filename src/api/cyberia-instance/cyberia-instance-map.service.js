/**
 * Instance Map service — strategic-graph REST payloads for the client's
 * expanded Instance Map modal.
 *
 * Serves two lightweight views of an instance, decoupled from the gameplay
 * AOI stream:
 *   static  — full graph topology: nodes (maps), edges (portals), and the
 *             strategic Points of Interest bound to each map (quest
 *             providers, action providers). Fetched once when the modal opens.
 *   dynamic — per-player provider activity (acceptable / active quest
 *             providers, active action providers). Polled ~1/s while the
 *             modal is open.
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
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const actionHasStandalonePayload = (action) =>
  (action.shopItems || []).length > 0 ||
  (action.craftRecipes || []).length > 0 ||
  (action.storageSlots || 0) > 0;

/**
 * Pure payload builder for the static graph. `world` matches the
 * resolveInstanceWorld shape: { instance, maps, quests, actions, fallback }.
 */
const buildStaticPayload = ({ instance, maps, quests, actions, fallback }) => {
  const nodes = maps.map((m) => ({
    mapCode: m.code,
    name: m.name || m.code,
    gridX: m.gridX,
    gridY: m.gridY,
    // File id of the map's auto-captured Object Layer render; the client
    // fetches /api/file/blob/:id and draws it as the node background.
    preview: m.preview ? String(m.preview) : '',
    questProviders: quests
      .filter((q) => q.sourceMapCode === m.code)
      .map((q) => ({ questCode: q.code, title: q.title || q.code, cellX: q.sourceCellX ?? 0, cellY: q.sourceCellY ?? 0 })),
    actionProviders: actions
      .filter((a) => a.sourceMapCode === m.code)
      .map((a) => ({ actionCode: a.code, label: a.label || a.code, cellX: a.sourceCellX ?? 0, cellY: a.sourceCellY ?? 0 })),
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
    else if (!completed.has(q.code) && (q.prerequisiteCodes || []).every((c) => completed.has(c)))
      state = 'acceptable';
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
    // Fallback world: topology is regenerated (portal cells may drift from
    // the live simulation's world), but map codes and provider POIs come
    // from the deterministic canonical defaults.
    const world = generateFallbackWorld();
    const mapCodes = new Set(world.instance.cyberiaMapCodes);
    return {
      instance: world.instance,
      maps: world.maps.map((m) => ({
        code: m.code,
        name: m.name || m.code,
        gridX: m.gridX,
        gridY: m.gridY,
      })),
      quests: DefaultCyberiaQuests.filter((q) => mapCodes.has(q.sourceMapCode)),
      actions: DefaultCyberiaActions.filter((a) => mapCodes.has(a.sourceMapCode)),
      fallback: true,
    };
  }

  const mapCodes = instance.cyberiaMapCodes || [];
  const [maps, dbQuests, dbActions] = await Promise.all([
    CyberiaMap.find({ code: { $in: mapCodes } })
      .select('code name gridX gridY preview')
      .lean(),
    CyberiaQuest.find({ sourceMapCode: { $in: mapCodes } })
      .select('code title prerequisiteCodes sourceMapCode sourceCellX sourceCellY')
      .lean(),
    CyberiaAction.find({ sourceMapCode: { $in: mapCodes } })
      .select('code label sourceMapCode sourceCellX sourceCellY questDialogueCodes shopItems craftRecipes storageSlots')
      .lean(),
  ]);

  const codeSet = new Set(mapCodes);
  return {
    instance,
    maps,
    // Empty collections fall back to canonical defaults, matching the quest
    // getByCode behaviour for unseeded databases.
    quests: dbQuests.length > 0 ? dbQuests : DefaultCyberiaQuests.filter((q) => codeSet.has(q.sourceMapCode)),
    actions: dbActions.length > 0 ? dbActions : DefaultCyberiaActions.filter((a) => codeSet.has(a.sourceMapCode)),
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

  static getDynamic = async (req, res, options) => {
    const { instanceCode } = req.params;
    if (!instanceCode) throw new Error('instanceCode parameter is required');
    const playerId = typeof req.query?.playerId === 'string' ? req.query.playerId.trim() : '';

    const CyberiaQuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', options);
    const { quests, actions } = await resolveInstanceWorld(instanceCode, options);

    const progress = playerId
      ? await CyberiaQuestProgress.find({ playerId }).select('questCode status').lean()
      : [];

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
