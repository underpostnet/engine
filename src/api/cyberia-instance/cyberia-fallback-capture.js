/**
 * Fallback-world capture — materialise the in-memory procedural world into
 * MongoDB so it can be exported, versioned, and re-imported like any authored
 * instance.
 *
 * The fallback world (cyberia-fallback-world.js) is never persisted: every
 * engine process rebuilds it from code defaults at boot and serves it whenever
 * a requested instance is absent. Capturing it means writing everything that
 * in-memory world serves under a real instance code:
 *
 *   - CyberiaInstance      — map graph, portal edges, player spawn, item ids
 *   - CyberiaMap           — one document per generated map (entities included)
 *   - CyberiaInstanceConf  — the world's simulation config
 *   - CyberiaSkill / CyberiaEntityTypeDefault / CyberiaDialogue /
 *     CyberiaAction / CyberiaQuest — the content collections the fallback path
 *     reads from code defaults INSTEAD of Mongo; a persisted instance reads
 *     them from Mongo, so they must exist there for the capture to serve the
 *     same world (see instance-data.js#fetchFullInstance).
 *
 * ObjectLayer/atlas assets are NOT generated here — they come from the asset
 * pipeline (`bin/cyberia ol <ids> --import`). The capture reports the missing
 * ids so the caller can stop before writing an incomplete backup.
 *
 * Map and content codes are namespaced under the instance code by default, so
 * two captures never overwrite each other's documents (map/action/quest codes
 * are globally unique). `keepFallbackCodes` preserves the raw
 * `fallback-map-*` / canonical action-quest codes instead.
 *
 * @module src/api/cyberia-instance/cyberia-fallback-capture
 */

import { loggerFactory } from '../../server/ops/logger.js';
import { collectReferencedItemIds } from './cyberia-fallback-world.js';
import {
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  DefaultCyberiaDialogues,
  DefaultSkillConfig,
  ENTITY_TYPE_DEFAULTS,
  fillInstanceConfDefaults,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const logger = loggerFactory(import.meta);

const FALLBACK_MAP_CODE_PREFIX = 'fallback-map-';

/** Mongo document keys that must never travel inside a `$set` payload. */
const DOC_METADATA_KEYS = ['_id', '__v', 'createdAt', 'updatedAt'];

const stripDocMetadata = (doc, extraKeys = []) => {
  const out = { ...doc };
  for (const key of [...DOC_METADATA_KEYS, ...extraKeys]) delete out[key];
  return out;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Namespaced map code for a captured fallback map (`fallback-map-2` → `X-map-2`). */
function captureMapCode(mapCode, instanceCode) {
  const suffix = mapCode.startsWith(FALLBACK_MAP_CODE_PREFIX)
    ? mapCode.slice(FALLBACK_MAP_CODE_PREFIX.length)
    : mapCode;
  return `${instanceCode}-map-${suffix}`;
}

/** Namespaced action/quest code for a captured world. */
const captureContentCode = (code, instanceCode) => `${instanceCode}-${code}`;

/**
 * Build the code translation tables for one capture.
 *
 * @param {object} world      Result of `generateFallbackWorld()`.
 * @param {string} instanceCode
 * @param {boolean} keepFallbackCodes
 * @returns {{ mapCodes: Map<string,string>, questCodes: Map<string,string>, actionCodes: Map<string,string> }}
 */
function buildCaptureCodeMaps({ world, instanceCode, keepFallbackCodes, actions, quests }) {
  const mapCodes = new Map();
  const rememberMapCode = (code) => {
    if (!code || mapCodes.has(code)) return;
    mapCodes.set(code, keepFallbackCodes ? code : captureMapCode(code, instanceCode));
  };

  for (const code of world.instance?.cyberiaMapCodes || []) rememberMapCode(code);
  for (const map of world.maps || []) rememberMapCode(map.code);
  for (const portal of world.instance?.portals || []) {
    rememberMapCode(portal.sourceMapCode);
    rememberMapCode(portal.targetMapCode);
  }

  const contentCodes = (docs) =>
    new Map(
      (docs || [])
        .filter((doc) => doc?.code)
        .map((doc) => [doc.code, keepFallbackCodes ? doc.code : captureContentCode(doc.code, instanceCode)]),
    );

  return { mapCodes, actionCodes: contentCodes(actions), questCodes: contentCodes(quests) };
}

/**
 * Translate one default action into its captured form. Returns `null` when the
 * action lives on a map this world does not contain — a persisted instance
 * only ever serves actions bound to its own maps.
 */
function captureAction(action, { mapCodes, actionCodes, questCodes }) {
  const sourceMapCode = mapCodes.get(action.sourceMapCode);
  if (!sourceMapCode) return null;
  return {
    ...action,
    code: actionCodes.get(action.code) || action.code,
    sourceMapCode,
    questDialogueCodes: (action.questDialogueCodes || []).map((entry) => ({
      ...entry,
      questCode: questCodes.get(entry.questCode) || entry.questCode,
    })),
  };
}

/** Translate one default quest into its captured form (`null` = foreign map). */
function captureQuest(quest, { mapCodes, questCodes }) {
  const sourceMapCode = mapCodes.get(quest.sourceMapCode);
  if (!sourceMapCode) return null;
  const translate = (codes) => (codes || []).map((code) => questCodes.get(code) || code);
  return {
    ...quest,
    code: questCodes.get(quest.code) || quest.code,
    sourceMapCode,
    prerequisiteCodes: translate(quest.prerequisiteCodes),
    unlocksQuestCodes: translate(quest.unlocksQuestCodes),
  };
}

/**
 * Pure planner: turn an in-memory fallback world into the exact set of
 * documents a capture writes. No I/O — the whole translation is testable
 * without a database.
 *
 * @param {object}   params
 * @param {object}   params.world              Result of `generateFallbackWorld()`.
 * @param {string}   params.instanceCode       Code the capture is stored under.
 * @param {boolean}  [params.keepFallbackCodes=false]
 * @param {Array}    [params.actions=DefaultCyberiaActions]
 * @param {Array}    [params.quests=DefaultCyberiaQuests]
 * @returns {{
 *   instance: object, conf: object, maps: object[], actions: object[], quests: object[],
 *   codeMaps: object, skippedActionCodes: string[], skippedQuestCodes: string[], itemIds: string[]
 * }}
 */
function planFallbackCapture({
  world,
  instanceCode,
  keepFallbackCodes = false,
  actions = DefaultCyberiaActions,
  quests = DefaultCyberiaQuests,
}) {
  if (!world?.instance || !Array.isArray(world.maps)) throw new Error('planFallbackCapture: invalid world');
  if (!instanceCode) throw new Error('planFallbackCapture: instanceCode is required');

  const codeMaps = buildCaptureCodeMaps({ world, instanceCode, keepFallbackCodes, actions, quests });
  const { mapCodes } = codeMaps;

  const maps = world.maps.map((map) => ({
    code: mapCodes.get(map.code) || map.code,
    name: map.name || mapCodes.get(map.code) || map.code,
    description: map.description || '',
    gridX: map.gridX,
    gridY: map.gridY,
    cellWidth: map.cellWidth,
    cellHeight: map.cellHeight,
    entities: (map.entities || []).map((entity) => ({ ...entity })),
    tags: ['fallback', 'procedural', 'captured'],
  }));

  const spawn = world.instance.playerSpawn || {};
  const instance = {
    code: instanceCode,
    name: instanceCode,
    description: 'Captured procedural fallback world',
    tags: ['fallback', 'procedural', 'captured'],
    cyberiaMapCodes: (world.instance.cyberiaMapCodes || []).map((code) => mapCodes.get(code) || code),
    portals: (world.instance.portals || []).map((portal) => ({
      ...portal,
      sourceMapCode: mapCodes.get(portal.sourceMapCode) || portal.sourceMapCode,
      targetMapCode: mapCodes.get(portal.targetMapCode) || portal.targetMapCode,
    })),
    playerSpawn: {
      ...spawn,
      ...(spawn.sourceMapCode ? { sourceMapCode: mapCodes.get(spawn.sourceMapCode) || spawn.sourceMapCode } : {}),
    },
    topologyMode: 'procedural',
    itemIds: (world.instance.itemIds || []).map((entry) => ({ ...entry })),
  };

  const conf = { ...fillInstanceConfDefaults(world.config || {}), instanceCode };

  const capturedActions = [];
  const skippedActionCodes = [];
  for (const action of actions) {
    const captured = captureAction(action, codeMaps);
    if (captured) capturedActions.push(captured);
    else skippedActionCodes.push(action.code);
  }

  const capturedQuests = [];
  const skippedQuestCodes = [];
  for (const quest of quests) {
    const captured = captureQuest(quest, codeMaps);
    if (captured) capturedQuests.push(captured);
    else skippedQuestCodes.push(quest.code);
  }

  return {
    instance,
    conf,
    maps,
    actions: capturedActions,
    quests: capturedQuests,
    codeMaps,
    skippedActionCodes,
    skippedQuestCodes,
    itemIds: collectCaptureItemIds({ instance, conf, maps, actions: capturedActions, quests: capturedQuests }),
  };
}

/**
 * Every ObjectLayer item id the captured instance needs an atlas for: what the
 * maps place, what the instance and conf declare, what the seeded skills and
 * entity-type defaults reference, and what the vendor/assembler/quest catalogs
 * draw icons for.
 *
 * @returns {string[]} Sorted, de-duplicated item ids.
 */
function collectCaptureItemIds({ instance, conf, maps, actions, quests }) {
  const ids = collectReferencedItemIds();
  const push = (id) => {
    if (typeof id === 'string' && id.length > 0 && !id.startsWith('$')) ids.add(id);
  };

  for (const map of maps || []) {
    for (const entity of map.entities || []) (entity.objectLayerItemIds || []).forEach(push);
  }
  for (const entry of instance?.itemIds || []) push(typeof entry === 'string' ? entry : entry?.id);

  for (const entityDefault of conf?.entityDefaults || []) {
    (entityDefault.liveItemIds || []).forEach(push);
    (entityDefault.deadItemIds || []).forEach(push);
    (entityDefault.dropItemIds || []).forEach(push);
    for (const slot of entityDefault.defaultObjectLayers || []) push(slot.itemId);
  }
  for (const skillConfig of conf?.skillConfig || []) {
    push(skillConfig.triggerItemId);
    for (const skill of skillConfig.skills || []) push(skill.summonedEntityItemId);
  }

  for (const action of actions || []) {
    for (const shopItem of action.shopItems || []) {
      push(shopItem.itemId);
      push(shopItem.priceItemId);
    }
    for (const recipe of action.craftRecipes || []) {
      (recipe.ingredients || []).forEach((ingredient) => push(ingredient.itemId));
      (recipe.outputItems || []).forEach((output) => push(output.itemId));
    }
  }
  for (const quest of quests || []) {
    for (const step of quest.steps || []) {
      for (const objective of step.objectives || []) push(objective.itemId);
    }
    for (const reward of quest.rewards || []) push(reward.itemId);
  }

  return [...ids].sort();
}

/**
 * Insert the content collections the fallback path serves from code defaults.
 *
 * Insert-only: an existing document is left exactly as the operator (or an
 * earlier import) left it, so a capture never silently rewrites content shared
 * with other instances. Returns per-collection insert counts.
 */
async function seedMissingContentDefaults({ CyberiaSkill, CyberiaEntityTypeDefault, CyberiaDialogue }) {
  const inserted = { skills: 0, entityTypeDefaults: 0, dialogues: 0 };

  const insertIfMissing = async (Model, filter, doc, counterKey) => {
    if (!Model) return;
    const existing = await Model.findOne(filter).lean();
    if (existing) return;
    await Model.create(doc);
    inserted[counterKey]++;
  };

  for (const skill of DefaultSkillConfig) {
    await insertIfMissing(
      CyberiaSkill,
      { triggerItemId: skill.triggerItemId },
      { triggerItemId: skill.triggerItemId, logicEventIds: skill.logicEventIds || [], skills: skill.skills || [] },
      'skills',
    );
  }

  for (const entityDefault of ENTITY_TYPE_DEFAULTS) {
    await insertIfMissing(
      CyberiaEntityTypeDefault,
      { entityType: entityDefault.entityType, liveItemIds: entityDefault.liveItemIds || [] },
      {
        entityType: entityDefault.entityType,
        liveItemIds: entityDefault.liveItemIds || [],
        deadItemIds: entityDefault.deadItemIds || [],
        dropItemIds: entityDefault.dropItemIds || [],
        defaultObjectLayers: entityDefault.defaultObjectLayers || [],
        behavior: entityDefault.behavior || '',
      },
      'entityTypeDefaults',
    );
  }

  for (const dialogue of DefaultCyberiaDialogues) {
    await insertIfMissing(
      CyberiaDialogue,
      { code: dialogue.code, order: dialogue.order },
      { ...dialogue },
      'dialogues',
    );
  }

  return inserted;
}

/**
 * Remove documents left over in this capture's own namespace by a previous,
 * larger capture (e.g. a world that used to have more maps). Only ever touches
 * codes prefixed with the instance code, and never runs in `keepFallbackCodes`
 * mode where the codes are the globally shared canonical ones.
 */
async function pruneStaleCaptureDocs({ models, instanceCode, plan }) {
  const namespace = new RegExp(`^${escapeRegExp(instanceCode)}-`);
  const pruned = { maps: 0, actions: 0, quests: 0 };

  const prune = async (Model, keepCodes, counterKey) => {
    if (!Model) return;
    const result = await Model.deleteMany({ code: { $regex: namespace, $nin: keepCodes } });
    pruned[counterKey] = result?.deletedCount || 0;
  };

  await prune(
    models.CyberiaMap,
    plan.maps.map((map) => map.code),
    'maps',
  );
  await prune(
    models.CyberiaAction,
    plan.actions.map((action) => action.code),
    'actions',
  );
  await prune(
    models.CyberiaQuest,
    plan.quests.map((quest) => quest.code),
    'quests',
  );

  return pruned;
}

/**
 * Materialise an in-memory fallback world into MongoDB under `instanceCode`.
 *
 * Idempotent: every write is an upsert keyed by the document's natural code,
 * so re-running a capture converges on the same state. Nothing is deleted
 * except stale documents inside this capture's own code namespace.
 *
 * @param {object} params
 * @param {object} params.models       `{ CyberiaInstance, CyberiaInstanceConf, CyberiaMap, CyberiaAction,
 *                                        CyberiaQuest, CyberiaSkill, CyberiaEntityTypeDefault,
 *                                        CyberiaDialogue, ObjectLayer }`
 * @param {object} params.world        Result of `generateFallbackWorld()`.
 * @param {string} params.instanceCode
 * @param {boolean} [params.keepFallbackCodes=false]
 * @returns {Promise<{plan: object, inserted: object, pruned: object, missingObjectLayerItemIds: string[]}>}
 */
async function captureFallbackWorld({ models, world, instanceCode, keepFallbackCodes = false }) {
  const plan = planFallbackCapture({ world, instanceCode, keepFallbackCodes });

  // Conf first: the instance document carries the ObjectId ref to it.
  const confDoc = await models.CyberiaInstanceConf.findOneAndUpdate(
    { instanceCode },
    { $set: stripDocMetadata(plan.conf, ['instanceCode']) },
    { upsert: true, returnDocument: 'after' },
  );
  logger.info('Captured CyberiaInstanceConf', { instanceCode });

  for (const map of plan.maps) {
    await models.CyberiaMap.findOneAndUpdate(
      { code: map.code },
      { $set: stripDocMetadata(map, ['code']) },
      { upsert: true },
    );
  }
  logger.info(`Captured ${plan.maps.length} CyberiaMap document(s)`, { codes: plan.maps.map((m) => m.code) });

  await models.CyberiaInstance.findOneAndUpdate(
    { code: instanceCode },
    {
      $set: {
        ...stripDocMetadata(plan.instance, ['code']),
        ...(confDoc?._id ? { conf: confDoc._id } : {}),
      },
      $setOnInsert: { status: 'unlisted' },
    },
    { upsert: true },
  );
  logger.info('Captured CyberiaInstance', { code: instanceCode, maps: plan.instance.cyberiaMapCodes.length });

  for (const action of plan.actions) {
    await models.CyberiaAction.findOneAndUpdate(
      { code: action.code },
      { $set: stripDocMetadata(action, ['code']) },
      { upsert: true },
    );
  }
  for (const quest of plan.quests) {
    await models.CyberiaQuest.findOneAndUpdate(
      { code: quest.code },
      { $set: stripDocMetadata(quest, ['code']) },
      { upsert: true },
    );
  }
  logger.info(`Captured ${plan.actions.length} CyberiaAction and ${plan.quests.length} CyberiaQuest document(s)`);
  if (plan.skippedActionCodes.length > 0 || plan.skippedQuestCodes.length > 0) {
    logger.warn('Skipped mission content bound to maps outside the captured world', {
      actions: plan.skippedActionCodes,
      quests: plan.skippedQuestCodes,
    });
  }

  const inserted = await seedMissingContentDefaults(models);
  logger.info('Seeded missing content defaults', inserted);

  // `keepFallbackCodes` reuses the globally shared canonical codes, so nothing
  // in that namespace belongs exclusively to this capture.
  const pruned = keepFallbackCodes
    ? { maps: 0, actions: 0, quests: 0 }
    : await pruneStaleCaptureDocs({ models, instanceCode, plan });
  if (pruned.maps || pruned.actions || pruned.quests)
    logger.info('Pruned stale documents from a previous capture', pruned);

  const presentItemIds = new Set(
    (await models.ObjectLayer.find({ 'data.item.id': { $in: plan.itemIds } }, { 'data.item.id': 1 }).lean()).map(
      (doc) => doc.data?.item?.id,
    ),
  );
  const missingObjectLayerItemIds = plan.itemIds.filter((id) => !presentItemIds.has(id));

  return { plan, inserted, pruned, missingObjectLayerItemIds };
}

export {
  planFallbackCapture,
  captureFallbackWorld,
  collectCaptureItemIds,
  captureMapCode,
  captureContentCode,
  seedMissingContentDefaults,
  FALLBACK_MAP_CODE_PREFIX,
};
