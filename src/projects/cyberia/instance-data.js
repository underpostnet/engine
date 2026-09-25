/**
 * Shared Cyberia instance world-load / boot data assembly.
 *
 * Single source of truth for the payloads the simulation server needs to boot
 * and hot-reload an instance: the full world (instance + maps + object layers +
 * simulation config + actions/quests), single map / object-layer lookups, and
 * the object-layer manifest.
 *
 * Both boot transports adapt this module, so they stay equivalent:
 *  - gRPC `CyberiaDataService` (src/grpc/cyberia/grpc-server.js), primary.
 *  - REST `/api/v1/cyberia-instance/boot/*`, fallback when gRPC is off.
 *
 * @module src/projects/cyberia/instance-data.js
 */

import crypto from 'crypto';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { currentContentView } from '../../db/content-view.js';
import {
  collectInstanceItemIds,
  collectSummonedItemIds,
  selectInstanceSkills,
} from '../../api/cyberia-instance/cyberia-instance-items.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { domainOrigin } from '../../server/domain/domain-client.js';
import { resolveLedgerBindings } from '../../server/domain/object-layer-resolver.js';
import { findAllBoundDefinitions, findBoundDefinition, findBoundDefinitions } from './object-layer-catalog.js';
import { PINNED_REFERENCES, collectPinnedCids } from '../../api/cyberia-item-catalog/item-ref.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS as FALLBACK_CONFIG_DEFAULTS,
  DEFAULT_DEAD_ITEM_ID,
  resolveProgressionRules,
  ENTITY_TYPE_DEFAULTS,
  resolveEntityInventory,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  DefaultSkillConfig,
} from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import {
  DEFAULT_INSTANCE_CODE,
  validateStats,
  validateEntityLevel,
  DefaultCyberiaItems,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { generateFallbackWorld } from '../../api/cyberia-instance/cyberia-fallback-world.js';

const logger = loggerFactory(import.meta);

/**
 * Builds the runtime env for one Cyberia MMO variant. The generic instance
 * loader deliberately has no knowledge of these application-specific keys;
 * Cyberia derives them from the normalized variant path/code here.
 * @param {object} context - Instance env build context.
 * @param {object} context.instance - Expanded instance descriptor.
 * @param {Object<string,string>} context.env - Parsed canonical env values.
 * @returns {Object<string,string>} Materialized Cyberia env values.
 */
function buildCyberiaMmoInstanceEnv({ instance = {}, env = {} }) {
  const built = { ...env };
  const instanceCode = instance.path === '/' ? DEFAULT_INSTANCE_CODE : instance.instanceCode;
  if (instance.runtime === 'cyberia-server') {
    built.INSTANCE_CODE = instanceCode;
    built.CYBERIA_BASE_PATH = instance.path;
  } else if (instance.runtime === 'cyberia-client') {
    built.CYBERIA_INSTANCE_CODE = instanceCode;
    built.CYBERIA_DEFAULT_INSTANCE = DEFAULT_INSTANCE_CODE;
    built.CYBERIA_BASE_PATH = instance.path;
  }
  return built;
}

/**
 * Resolves the mongoose model bag for a DB context, in the content view of the running code:
 * the served release for the runtime, the workspace for authoring.
 * @param {{host?: string, path?: string}|string} context - RouterOptions-style
 *   context or a resolved `${host}${path}` key (the gRPC dbKey form).
 */
function getInstanceModels(context) {
  return DataBaseProviderService.viewModels(context, currentContentView());
}

// The wire still carries inventory rows; the model no longer stores them. `defaultObjectLayers`
// is derived here, once, from the discriminator lists — see resolveEntityInventory().
function normalizeEntityDefault(entityDefault = {}, canonical = {}, itemTypes) {
  const normalized = {
    entityType: entityDefault.entityType ?? canonical.entityType ?? '',
    liveItemIds: [...(entityDefault.liveItemIds ?? canonical.liveItemIds ?? [])],
    deadItemIds: [...(entityDefault.deadItemIds ?? canonical.deadItemIds ?? [])],
    dropItemIds: [...(entityDefault.dropItemIds ?? canonical.dropItemIds ?? [])],
    inventoryItemsIds: [...(entityDefault.inventoryItemsIds ?? canonical.inventoryItemsIds ?? [])],
    overrideItemsIdsState: [
      ...(entityDefault.overrideItemsIdsState ?? canonical.overrideItemsIdsState ?? []),
    ],
    behavior: entityDefault.behavior ?? canonical.behavior ?? '',
  };
  return { ...normalized, defaultObjectLayers: resolveEntityInventory(normalized, { itemTypes }) };
}

// Map CyberiaSkill documents to the proto skillConfig shape. The collection is the authoritative
// source and carries the full metadata (summonedEntityItemId, name, description); the wire message
// is built from the subset this instance runs, which nothing persists.
function skillDocsToConfig(skillDocs = []) {
  return skillDocs
    .filter((d) => d && d.triggerItemId)
    .map((d) => ({
      triggerItemId: d.triggerItemId,
      skills: (d.skills || []).map((sk) => ({
        logicEventId: sk.logicEventId || '',
        name: sk.name || '',
        description: sk.description || '',
        summonedEntityItemId: sk.summonedEntityItemId || '',
      })),
    }));
}

// Every skill definition the deployment knows. Which of them an instance runs is decided by
// selectInstanceSkills against that instance's own content. Returns [] when the model is not
// loaded (api not mounted), so callers fall back to the canonical definitions.
async function loadSkillDocs(models) {
  if (!models.CyberiaSkill) return [];
  return await models.CyberiaSkill.find({}).lean();
}

// Map CyberiaEntityTypeDefault docs to the wire entityDefaults shape. Lookup is
// by liveItemIds membership, so each variant travels as its own entry.
function entityTypeDefaultDocsToConfig(docs = []) {
  return docs
    .filter((d) => d && d.entityType)
    .map((d) => ({
      entityType: d.entityType,
      liveItemIds: [...(d.liveItemIds || [])],
      deadItemIds: [...(d.deadItemIds || [])],
      dropItemIds: [...(d.dropItemIds || [])],
      inventoryItemsIds: [...(d.inventoryItemsIds || [])],
      overrideItemsIdsState: [...(d.overrideItemsIdsState || [])],
      behavior: d.behavior || '',
    }));
}

// Load the entity-type defaults THIS instance references. The conf names them by _id, so a
// document reaches a world only when that world points at it — never because another instance
// happens to share an item id with it, which is what used to drag foreign wiring into a build.
async function loadEntityTypeDefaultDocs(models, conf) {
  if (!models.CyberiaEntityTypeDefault) return [];
  const ids = (conf?.entityDefaults || []).map((id) => String(id?._id ?? id)).filter(Boolean);
  if (ids.length === 0) return [];
  const docs = await models.CyberiaEntityTypeDefault.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

// `itemTypes` lets the equipment rules settle a contested slot: which skin an entity wears when an
// override names one. Without it every row keeps the state its list derives, which is the right
// answer for a world whose object layers have not been read yet.
function mergeEntityDefaults(entityDefaults = [], itemTypes) {
  const merged = entityDefaults.map((entityDefault) => normalizeEntityDefault(entityDefault, {}, itemTypes));
  const coveredTypes = new Set(merged.map((entityDefault) => entityDefault.entityType));
  for (const canonical of ENTITY_TYPE_DEFAULTS) {
    if (!coveredTypes.has(canonical.entityType)) merged.push(normalizeEntityDefault(canonical, canonical, itemTypes));
  }
  return merged;
}

/** itemId → item type, read from the ObjectLayer documents a world already loads for its atlases. */
function itemTypesOf(objectLayerDocs = []) {
  const types = {};
  for (const doc of objectLayerDocs) {
    const item = doc?.data?.item;
    if (item?.id && item?.type) types[item.id] = item.type;
  }
  return types;
}

// ── Mongoose doc → wire message converters (proto camelCase shapes) ────────

// The wire's `ledger` is the ItemLedger binding of the definition, a projection Cyberia reads;
// the document stores none of it.
function toObjectLayerMsg(doc, binding = null) {
  const d = doc.data || {};
  const item = d.item || {};
  const render = d.render || {};
  return {
    stats: validateStats(d.stats),
    item: {
      id: item.id || '',
      type: item.type || '',
      description: item.description || '',
      activable: !!item.activable,
    },
    ledger: binding
      ? {
          standard: binding.standard || 'ERC1155',
          chainId: Number(binding.chainId) || 0,
          contractAddress: binding.contractAddress || '',
          tokenId: binding.tokenId || '',
        }
      : { standard: '', chainId: 0, contractAddress: '', tokenId: '' },
    render: {
      cid: render.cid || '',
      metadataCid: render.metadataCid || '',
    },
    cid: doc.cid || '',
  };
}

/**
 * ItemLedger bindings of the given definitions, keyed by cid. The ItemLedger host reads its
 * own projection; any other deployment asks the ItemLedger API. A ledger that cannot be
 * reached serves every definition as unregistered: play never waits on the ledger.
 * @param {object} models - Instance models, see {@link getInstanceModels}.
 * @param {object[]} docs - ObjectLayer documents.
 * @returns {Promise<Map<string, object>>}
 */
async function fetchLedgerBindings(models, docs = []) {
  const bindings = new Map();
  const cids = [...new Set(docs.map((doc) => doc?.cid).filter(Boolean))];
  if (cids.length === 0) return bindings;
  if (models.ItemLedger) {
    const rows = await models.ItemLedger.find({ objectLayerCid: { $in: cids } })
      .sort({ chainId: 1, contractAddress: 1 })
      .lean();
    for (const row of rows) if (!bindings.has(row.objectLayerCid)) bindings.set(row.objectLayerCid, row);
    return bindings;
  }
  if (!domainOrigin('item-ledger')) return bindings;
  await Promise.all(
    cids.map(async (cid) => {
      try {
        const [row] = await resolveLedgerBindings(cid);
        if (row) bindings.set(cid, row);
      } catch (error) {
        logger.warn(`ItemLedger unavailable for ${cid}: ${error.message}`);
      }
    }),
  );
  return bindings;
}

/** Wire messages of definitions with their ItemLedger bindings. */
async function toObjectLayerMsgs(models, docs) {
  const bindings = await fetchLedgerBindings(models, docs);
  return docs.map((doc) => toObjectLayerMsg(doc, bindings.get(doc.cid) || null));
}

/**
 * Parse a CSS rgba() colour string into {r, g, b, a} integer components.
 * Returns {r:0, g:0, b:0, a:0} (transparent) when the string is absent or malformed.
 */
function parseRgba(str) {
  if (!str) return { r: 0, g: 0, b: 0, a: 0 };
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return { r: 0, g: 0, b: 0, a: 0 };
  // CSS alpha is 0-1 float; the wire format uses 0-255 int.
  const cssAlpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Math.round(cssAlpha * 255) };
}

function toEntityMsg(ent) {
  const rgba = parseRgba(ent.color);
  return {
    entityType: ent.entityType || 'floor',
    level: ent.level === undefined ? 0 : validateEntityLevel(ent.level),
    initCellX: ent.initCellX || 0,
    initCellY: ent.initCellY || 0,
    dimX: ent.dimX || 1,
    dimY: ent.dimY || 1,
    color: ent.color || '',
    objectLayerItemIds: ent.objectLayerItemIds || [],
    spawnRadius: ent.spawnRadius || 0,
    aggroRange: ent.aggroRange || 0,
    maxLife: ent.maxLife || 0,
    lifeRegen: ent.lifeRegen || 0,
    portalSubtype: ent.portalSubtype || '',
    colorR: rgba.r,
    colorG: rgba.g,
    colorB: rgba.b,
    colorA: rgba.a,
  };
}

function toMapMsg(doc) {
  return {
    mongoId: String(doc._id),
    code: doc.code || '',
    name: doc.name || '',
    gridX: doc.gridX || 16,
    gridY: doc.gridY || 16,
    cellWidth: doc.cellWidth || 32,
    cellHeight: doc.cellHeight || 32,
    entities: (doc.entities || []).map(toEntityMsg),
  };
}

function toInstanceMsg(doc) {
  return {
    mongoId: String(doc._id),
    code: doc.code || '',
    name: doc.name || '',
    description: doc.description || '',
    tags: doc.tags || [],
    mapCodes: doc.cyberiaMapCodes || [],
    portals: (doc.portals || []).map((p) => ({
      sourceMapCode: p.sourceMapCode || '',
      sourceCellX: p.sourceCellX || 0,
      sourceCellY: p.sourceCellY || 0,
      targetMapCode: p.targetMapCode || '',
      targetCellX: p.targetCellX || 0,
      targetCellY: p.targetCellY || 0,
      portalMode: p.portalMode || 'inter-portal',
    })),
    topologyMode: doc.topologyMode || 'hybrid',
    seed: doc.seed || '',
    playerSpawn: {
      sourceMapCode: doc.playerSpawn?.sourceMapCode || '',
      sourceCellX: doc.playerSpawn?.sourceCellX || 0,
      sourceCellY: doc.playerSpawn?.sourceCellY || 0,
      random: !!doc.playerSpawn?.random,
    },
  };
}

const toCraftItemMsg = (i) => ({ itemId: i.itemId || '', objectLayerCid: i.objectLayerCid || '', qty: i.qty ?? 1 });

// CyberiaAction → CyberiaActionMessage (proto camelCase fields).
function toActionMsg(a) {
  return {
    code: a.code || '',
    label: a.label || '',
    sourceMapCode: a.sourceMapCode || '',
    sourceCellX: a.sourceCellX || 0,
    sourceCellY: a.sourceCellY || 0,
    dialogCode: a.dialogCode || '',
    questDialogueCodes: (a.questDialogueCodes || []).map((qd) => ({
      questCode: qd.questCode || '',
      dialogCode: qd.dialogCode || '',
    })),
    shopItems: (a.shopItems || []).map((si) => ({
      itemId: si.itemId || '',
      objectLayerCid: si.objectLayerCid || '',
      priceItemId: si.priceItemId || 'coin',
      priceObjectLayerCid: si.priceObjectLayerCid || '',
      priceQty: si.priceQty ?? 1,
    })),
    craftRecipes: (a.craftRecipes || []).map((r) => ({
      outputItems: (r.outputItems || []).map(toCraftItemMsg),
      ingredients: (r.ingredients || []).map(toCraftItemMsg),
      craftTimeMs: r.craftTimeMs ?? 0,
    })),
    storageSlots: a.storageSlots ?? 0,
  };
}

// CyberiaQuest → CyberiaQuestMessage.
function toQuestMsg(q) {
  return {
    code: q.code || '',
    title: q.title || '',
    description: q.description || '',
    unlocksQuestCodes: q.unlocksQuestCodes || [],
    prerequisiteCodes: q.prerequisiteCodes || [],
    sourceMapCode: q.sourceMapCode || '',
    sourceCellX: q.sourceCellX || 0,
    sourceCellY: q.sourceCellY || 0,
    steps: (q.steps || []).map((s) => ({
      id: s.id || '',
      description: s.description || '',
      objectives: (s.objectives || []).map((o) => ({
        type: o.type || '',
        itemId: o.itemId || '',
        objectLayerCid: o.objectLayerCid || '',
        quantity: o.quantity || 1,
      })),
    })),
    rewards: (q.rewards || []).map((r) => ({
      itemId: r.itemId || '',
      objectLayerCid: r.objectLayerCid || '',
      quantity: r.quantity || 1,
    })),
  };
}

/**
 * Converts a CyberiaInstanceConf Mongoose document (or plain object) into
 * a complete InstanceConfig message.
 * Any field that is null/undefined in `gc` falls back to FALLBACK_CONFIG_DEFAULTS,
 * so partial DB documents always produce a fully playable config.
 */
// A chance is a fraction of one. Anything else a conf carries is not a chance and resolves to
// the default, the same way a partial progression curve inherits its missing fields.
const chanceOf = (value, fallback) => (Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback);

function toInstanceConfig(gc) {
  const fb = FALLBACK_CONFIG_DEFAULTS;
  if (!gc) return buildFallbackConfig();

  // STRICT BOUNDARY: this config is simulation only. Presentation values
  // (palette, camera tunings, screen factors, devUi, interpolationMs,
  // status-icon visuals, entityDefaults[].colorKey, cellSize, defaultObj*)
  // reach the client through /api/v1/cyberia-client-hints, never a boot transport.

  // The conf carries references, not documents: the caller resolves them and overwrites this
  // with the result. Canonical defaults alone are the correct answer for a world that
  // references none, and for the fallback build that has no conf at all.
  const entityDefaults = mergeEntityDefaults();

  return {
    tickRate: gc.tickRate ?? fb.tickRate,
    snapshotRate: gc.snapshotRate ?? fb.snapshotRate,
    aoiRadius: gc.aoiRadius ?? fb.aoiRadius,
    portalHoldTimeMs: gc.portalHoldTimeMs ?? fb.portalHoldTimeMs,
    portalSpawnRadius: gc.portalSpawnRadius ?? fb.portalSpawnRadius,
    entityBaseSpeed: gc.entityBaseSpeed ?? fb.entityBaseSpeed,
    entityBaseMaxLife: gc.entityBaseMaxLife ?? fb.entityBaseMaxLife,
    entityBaseActionCooldownMs: gc.entityBaseActionCooldownMs ?? fb.entityBaseActionCooldownMs,
    entityBaseMinActionCooldownMs: gc.entityBaseMinActionCooldownMs ?? fb.entityBaseMinActionCooldownMs,
    botAggroRange: gc.botAggroRange ?? fb.botAggroRange,
    defaultPlayerWidth: gc.defaultPlayerWidth ?? fb.defaultPlayerWidth,
    defaultPlayerHeight: gc.defaultPlayerHeight ?? fb.defaultPlayerHeight,
    playerBaseSpeed: gc.playerBaseSpeed ?? fb.playerBaseSpeed,
    playerBaseLifeRegenMin: gc.playerBaseLifeRegenMin ?? fb.playerBaseLifeRegenMin,
    playerBaseLifeRegenMax: gc.playerBaseLifeRegenMax ?? fb.playerBaseLifeRegenMax,
    progressionRules: resolveProgressionRules(gc.progressionRules),
    maxActiveLayers: gc.maxActiveLayers ?? fb.maxActiveLayers,
    initialLifeFraction: gc.initialLifeFraction ?? fb.initialLifeFraction,
    respawnDurationMs: gc.respawnDurationMs ?? fb.respawnDurationMs,
    collisionLifeLoss: gc.collisionLifeLoss ?? fb.collisionLifeLoss,
    // Economy — Fountain & Sink (nested EconomyRules message).
    economyRules: {
      botSpawnCoins: gc.economyRules?.botSpawnCoins ?? fb.economyRules.botSpawnCoins,
      playerSpawnCoins: gc.economyRules?.playerSpawnCoins ?? fb.economyRules.playerSpawnCoins,
      coinKillPercentVsBot: gc.economyRules?.coinKillPercentVsBot ?? fb.economyRules.coinKillPercentVsBot,
      coinKillPercentVsPlayer: gc.economyRules?.coinKillPercentVsPlayer ?? fb.economyRules.coinKillPercentVsPlayer,
      coinKillMinAmount: gc.economyRules?.coinKillMinAmount ?? fb.economyRules.coinKillMinAmount,
      respawnCostPercent: gc.economyRules?.respawnCostPercent ?? fb.economyRules.respawnCostPercent,
      portalFee: gc.economyRules?.portalFee ?? fb.economyRules.portalFee,
      craftingFeePercent: gc.economyRules?.craftingFeePercent ?? fb.economyRules.craftingFeePercent,
    },
    lifeRegenChance: chanceOf(gc.lifeRegenChance, fb.lifeRegenChance),
    maxChance: chanceOf(gc.maxChance, fb.maxChance),
    entityDefaults,
    // Filled in by the caller from the skills this world's own content triggers; a conf stores
    // none, so there is nothing here to fall back to.
    skillConfig: [],
    skillRules: {
      projectileSpawnChance: chanceOf(gc.skillRules?.projectileSpawnChance, fb.skillRules.projectileSpawnChance),
      projectileLifetimeMs: gc.skillRules?.projectileLifetimeMs ?? fb.skillRules.projectileLifetimeMs,
      projectileWidth: gc.skillRules?.projectileWidth ?? fb.skillRules.projectileWidth,
      projectileHeight: gc.skillRules?.projectileHeight ?? fb.skillRules.projectileHeight,
      projectileSpeedMultiplier: gc.skillRules?.projectileSpeedMultiplier ?? fb.skillRules.projectileSpeedMultiplier,
      doppelgangerSpawnChance: chanceOf(gc.skillRules?.doppelgangerSpawnChance, fb.skillRules.doppelgangerSpawnChance),
      doppelgangerLifetimeMs: gc.skillRules?.doppelgangerLifetimeMs ?? fb.skillRules.doppelgangerLifetimeMs,
      doppelgangerSpawnRadius: gc.skillRules?.doppelgangerSpawnRadius ?? fb.skillRules.doppelgangerSpawnRadius,
      doppelgangerInitialLifeFraction:
        gc.skillRules?.doppelgangerInitialLifeFraction ?? fb.skillRules.doppelgangerInitialLifeFraction,
    },
    // Equipment rules — activation constraints (nested EquipmentRules message).
    equipmentRules: {
      activeItemTypes: gc.equipmentRules?.activeItemTypes ?? fb.equipmentRules.activeItemTypes,
      onePerType: gc.equipmentRules?.onePerType ?? fb.equipmentRules.onePerType,
      requireSkin: gc.equipmentRules?.requireSkin ?? fb.equipmentRules.requireSkin,
    },
  };
}

/**
 * Builds a minimal InstanceConfig with playable defaults.
 * Derived from CYBERIA_INSTANCE_CONF_DEFAULTS (shared with the Mongoose model).
 * Used when the requested instance does not exist in the database.
 */
function buildFallbackConfig() {
  return JSON.parse(JSON.stringify(FALLBACK_CONFIG_DEFAULTS));
}

// ═══════════════════════════════════════════════════════════════════
// Transport-agnostic fetchers — one per CyberiaDataService RPC
// ═══════════════════════════════════════════════════════════════════

/** Ping payload (RPC: ping). */
const pingData = () => ({ serverTimeMs: Date.now() });

/** Mongo filter for object-layer batch queries (RPC: getObjectLayerBatch). */
const objectLayerQueryFilter = (itemTypeFilter) => (itemTypeFilter ? { 'data.item.type': itemTypeFilter } : {});

/** All ObjectLayers, optionally filtered by item type (RPC: getObjectLayerBatch). */
async function fetchObjectLayerBatch(models, itemTypeFilter) {
  const docs = await findAllBoundDefinitions(models, objectLayerQueryFilter(itemTypeFilter));
  return await toObjectLayerMsgs(models, docs);
}

/** The definition bound to an item label, null when unbound (RPC: getObjectLayer). */
async function fetchObjectLayer(models, itemId) {
  const doc = await findBoundDefinition(models, itemId);
  return doc ? (await toObjectLayerMsgs(models, [doc]))[0] : null;
}

/**
 * Single map by code, null when absent (RPC: getMapData). When `instanceCode`
 * is provided, upserts the GlobalMapCodeRegistry entry tracking which instance
 * is serving the map (same side-effect on both transports).
 */
async function fetchMapData(models, { mapCode, instanceCode } = {}) {
  const doc = await models.CyberiaMap.findOne({ code: mapCode }).lean();
  if (!doc) return null;

  if (instanceCode) {
    models.GlobalMapCodeRegistry.findOneAndUpdate(
      { mapCode },
      { instanceCode, status: 'active' },
      { upsert: true, returnDocument: 'after', timestamps: true },
    ).catch((err) => logger.warn('fetchMapData registry update failed:', err.message));
  }

  return { map: toMapMsg(doc) };
}

/** Label → bound definition cid (RPC: getObjectLayerManifest). */
async function fetchObjectLayerManifest(models) {
  const entries = await models.CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1 }).lean();
  const stored = entries.length
    ? await models.ObjectLayer.distinct('cid', { cid: { $in: entries.map((e) => e.objectLayerCid) } })
    : [];
  const served = new Set(stored);
  return {
    entries: entries
      .filter((e) => served.has(e.objectLayerCid))
      .map((e) => ({ itemId: e.itemId, cid: e.objectLayerCid })),
  };
}

/**
 * Full world-load payload for one instance (RPC: getFullInstance):
 * `{ instance, maps, objectLayers, config, version, actions, quests }`.
 * Falls back to the procedural world when the instance does not exist.
 */
async function fetchFullInstance(models, requestedInstanceCode) {
  // Normalise empty instanceCode to the canonical fallback name.
  const instanceCode = requestedInstanceCode || 'default';
  const inst = await models.CyberiaInstance.findOne({ code: instanceCode }).populate('conf').lean();

  // ── Fallback: instance not found → return a multi-map procedural world ──
  if (!inst) {
    logger.info(`Instance "${instanceCode}" not found — returning fallback world.`);
    const world = generateFallbackWorld();
    const fallbackConf = buildFallbackConfig();

    // Collect every objectLayerItemId of the generated maps, so the atlases
    // resolve at startup.
    const fallbackItemIds = new Set();
    for (const m of world.maps) {
      for (const e of m.entities || []) {
        for (const id of e.objectLayerItemIds || []) fallbackItemIds.add(id);
      }
    }
    // Also include system OL items from the canonical entity defaults — the fallback world
    // references no collection document, so these are the defaults it actually runs on.
    for (const d of ENTITY_TYPE_DEFAULTS) {
      for (const id of d.liveItemIds || []) fallbackItemIds.add(id);
      for (const id of d.deadItemIds || []) fallbackItemIds.add(id);
      for (const id of d.dropItemIds || []) fallbackItemIds.add(id);
      for (const id of d.inventoryItemsIds || []) fallbackItemIds.add(id);
    }
    // Include every canonical item so the server knows the type of anything a
    // player can pick up. The one-per-type rule no-ops on an unknown type.
    for (const it of DefaultCyberiaItems || []) {
      if (it?.item?.id) fallbackItemIds.add(it.item.id);
    }

    // The fallback world is fully self-contained: content config comes
    // exclusively from the canonical code defaults (cyberia-server-defaults
    // + SharedDefaultsCyberia). Own-model collections (CyberiaSkill,
    // CyberiaEntityTypeDefault) are deliberately NOT consulted here so a
    // stale seed can never mask a code-default change. Only ObjectLayer is
    // read — sprite/render assets have no code-side source.
    const fallbackOlDocs = await findBoundDefinitions(models, [...fallbackItemIds]);

    const fallbackConfig = toInstanceConfig(fallbackConf);
    // Same membership rule as a persisted world, over the canonical definitions: this path
    // consults no collection, so DefaultSkillConfig is the only source of skills it has.
    fallbackConfig.skillConfig = skillDocsToConfig(selectInstanceSkills(DefaultSkillConfig, fallbackItemIds));

    // Opaque version over everything mutable in this payload, mirroring the
    // persisted path below. A constant here would make hot reload a silent
    // no-op: WorldBuilder.ReloadWorld skips the rebuild — and therefore
    // ApplyInstanceConfig when content and configuration are unchanged.
    const fallbackVersionParts = ['fallback', JSON.stringify(fallbackConfig)];
    for (const doc of fallbackOlDocs) fallbackVersionParts.push(String(doc.contentHash || doc._id));
    const fallbackVersion = `fallback-${crypto
      .createHash('sha256')
      .update(fallbackVersionParts.join('|'))
      .digest('hex')}`;

    return {
      instance: toInstanceMsg({ ...world.instance, _id: '', seed: instanceCode }),
      maps: world.maps.map((m) => ({
        mongoId: '',
        code: m.code,
        name: m.name,
        gridX: m.gridX,
        gridY: m.gridY,
        cellWidth: m.cellWidth,
        cellHeight: m.cellHeight,
        entities: (m.entities || []).map(toEntityMsg),
      })),
      objectLayers: await toObjectLayerMsgs(models, fallbackOlDocs),
      config: fallbackConfig,
      version: fallbackVersion,
      // Mission content for the fallback comes from the code defaults, no DB.
      actions: DefaultCyberiaActions.map(toActionMsg),
      quests: DefaultCyberiaQuests.map(toQuestMsg),
    };
  }

  // ── Instance found — load maps + entity OLs + config default OLs ──────
  // `populate('conf')` returns null when the ObjectId ref is missing or
  // orphaned. The direct instanceCode lookup keeps every tuning field coming
  // from the database instead of FALLBACK_CONFIG_DEFAULTS.
  let conf = inst.conf;
  if (!conf) {
    conf = await models.CyberiaInstanceConf.findOne({ instanceCode }).lean();
    if (conf) {
      logger.warn(`fetchFullInstance: conf ref missing on instance "${instanceCode}" — resolved by instanceCode lookup`);
    }
  }
  conf = conf || {};
  const mapCodes = inst.cyberiaMapCodes || [];
  const mapDocs = mapCodes.length ? await models.CyberiaMap.find({ code: { $in: mapCodes } }).lean() : [];

  // Authoritative per-entity-type defaults are the documents this instance's conf references;
  // referencing none leaves the canonical defaults in place.
  const entityDefaultDocs = await loadEntityTypeDefaultDocs(models, conf);
  const entityDefaultsConfig = entityTypeDefaultDocsToConfig(entityDefaultDocs);

  // Mission content for this instance: actions and quests bound to its maps (by sourceMapCode).
  // Delivered with the world so the Go server never opens a separate content channel, and never
  // receives content from other instances' maps. Read before the item set because what a vendor
  // sells and what a quest asks for are part of what this world owns.
  const actionDocs =
    mapCodes.length && models.CyberiaAction
      ? await models.CyberiaAction.find({ sourceMapCode: { $in: mapCodes } }).lean()
      : [];
  const questDocs =
    mapCodes.length && models.CyberiaQuest
      ? await models.CyberiaQuest.find({ sourceMapCode: { $in: mapCodes } }).lean()
      : [];

  // Everything this world names, by the one rule the export and the editor's sync also use. The
  // canonical defaults join the instance's own: every world runs on both, so an entity here can
  // hold what they wire even when no map places it.
  const owned = collectInstanceItemIds({
    maps: mapDocs,
    entityDefaults: [...entityDefaultsConfig, ...ENTITY_TYPE_DEFAULTS],
    actions: actionDocs,
    quests: questDocs,
  });

  const itemIds = new Set(owned);
  // The Go server falls back to this dead visual when a build declares
  // no deadItemIds — its atlas must resolve even when nothing references it.
  itemIds.add(DEFAULT_DEAD_ITEM_ID);

  // The skills this world runs: the collection owns the definitions, and a trigger item the
  // world never names is unreachable here. The canonical definitions stand in only for a
  // deployment that never seeded the collection — never for a world that legitimately selects
  // none of them, which would put back skills an operator deleted. What the selected skills
  // summon needs an atlas, so those ids join the set before the ObjectLayer query.
  const seededSkills = await loadSkillDocs(models);
  const skillDocs = selectInstanceSkills(seededSkills.length ? seededSkills : DefaultSkillConfig, owned);
  for (const summoned of collectSummonedItemIds(skillDocs)) itemIds.add(summoned);

  // Content that pins a definition decides which one this world runs; the catalog answers
  // only for labels no content pinned. One label pinned to two definitions is a content
  // error, never a silent choice.
  const pinned = collectPinnedCids(questDocs, PINNED_REFERENCES.CyberiaQuest);
  collectPinnedCids(actionDocs, PINNED_REFERENCES.CyberiaAction, pinned);
  const conflicts = [...pinned].filter(([, cids]) => cids.size > 1);
  if (conflicts.length > 0) {
    throw new Error(
      `Instance "${instanceCode}" pins several definitions for: ${conflicts
        .map(([itemId, cids]) => `${itemId} (${[...cids].join(', ')})`)
        .join('; ')}`,
    );
  }
  const pinnedCids = [...pinned].filter(([itemId]) => itemIds.has(itemId)).map(([, cids]) => [...cids][0]);
  const olDocs = [
    ...(pinnedCids.length ? await models.ObjectLayer.find({ cid: { $in: pinnedCids } }).lean() : []),
    ...(await findBoundDefinitions(models, [...itemIds].filter((itemId) => !pinned.has(itemId)))),
  ];

  // Opaque version over the updatedAt timestamps. The server compares it to
  // skip a full world rebuild when nothing changed.
  const versionParts = [String(inst.updatedAt || inst._id), JSON.stringify(toInstanceConfig(conf))];
  for (const m of mapDocs) versionParts.push(String(m.updatedAt || m._id));
  if (conf.updatedAt) versionParts.push(String(conf.updatedAt));
  // Skill edits live in their own collection — fold them in so a skill
  // change triggers a Go-side world rebuild instead of serving stale skills.
  for (const sk of skillDocs) versionParts.push(String(sk.updatedAt || sk._id || sk.triggerItemId));
  // Entity-type-default edits live in their own collection too — fold them
  // in so adding/editing a default (e.g. a new resource) rebuilds the world.
  for (const ed of entityDefaultDocs) versionParts.push(String(ed.updatedAt || ed._id));
  const version = crypto.createHash('sha256').update(versionParts.join('|')).digest('hex');

  const baseConfig = toInstanceConfig(conf);
  // The referenced documents are the world's defaults, completed by the canonical set for every
  // entity type they do not cover. Every variant — each resource skin, say — reaches the Go
  // runtime keyed by liveItemIds. Applied BEFORE default-player-inventory so the player layer
  // additions survive.
  if (entityDefaultsConfig.length) {
    baseConfig.entityDefaults = mergeEntityDefaults(entityDefaultsConfig, itemTypesOf(olDocs));
  }
  // The wire still carries a skillConfig; nothing stores one. It is exactly the skills selected
  // above, so what the simulation runs and what the export writes come from one decision.
  baseConfig.skillConfig = skillDocsToConfig(skillDocs);

  return {
    instance: toInstanceMsg(inst),
    maps: mapDocs.map(toMapMsg),
    objectLayers: await toObjectLayerMsgs(models, olDocs),
    config: baseConfig,
    version,
    actions: actionDocs.map(toActionMsg),
    quests: questDocs.map(toQuestMsg),
  };
}

/**
 * Every ObjectLayer item id one instance runs on, as stored documents.
 *
 * Reads the world the same way the runtime does, so a tool never disagrees with the
 * simulation about what a world owns. Ids the instance names but the collection does not
 * hold are absent, because {@link fetchFullInstance} resolves the set against ObjectLayer.
 *
 * @param {object} models - Instance models, see {@link getInstanceModels}.
 * @param {string} instanceCode - Instance code, must exist.
 * @returns {Promise<string[]>} Item ids, no duplicates.
 * @throws {Error} When no CyberiaInstance holds that code.
 */
async function fetchInstanceObjectLayerItemIds(models, instanceCode) {
  const instance = await models.CyberiaInstance.findOne({ code: instanceCode }, { _id: 1 }).lean();
  if (!instance) throw new Error(`CyberiaInstance "${instanceCode}" not found`);
  const { objectLayers } = await fetchFullInstance(models, instanceCode);
  return [...new Set(objectLayers.map((objectLayer) => objectLayer?.item?.id).filter(Boolean))];
}

export {
  buildCyberiaMmoInstanceEnv as buildInstanceEnv,
  buildCyberiaMmoInstanceEnv,
  fetchInstanceObjectLayerItemIds,
  getInstanceModels,
  itemTypesOf,
  normalizeEntityDefault,
  skillDocsToConfig,
  entityTypeDefaultDocsToConfig,
  mergeEntityDefaults,
  parseRgba,
  toObjectLayerMsg,
  toObjectLayerMsgs,
  fetchLedgerBindings,
  toEntityMsg,
  toMapMsg,
  toInstanceMsg,
  toActionMsg,
  toQuestMsg,
  toInstanceConfig,
  buildFallbackConfig,
  pingData,
  objectLayerQueryFilter,
  fetchObjectLayerBatch,
  fetchObjectLayer,
  fetchMapData,
  fetchObjectLayerManifest,
  fetchFullInstance,
};
