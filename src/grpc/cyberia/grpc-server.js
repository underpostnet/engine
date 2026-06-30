/**
 * gRPC server for the Cyberia Engine data pipeline.
 *
 * Runs alongside Express on a separate port (default 50051).
 * Provides read-only RPCs for the Go game server to fetch
 * ObjectLayers, Instances, and Maps from MongoDB.
 *
 * @module src/grpc/cyberia/grpc-server.js
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS as FALLBACK_CONFIG_DEFAULTS,
  DEFAULT_PLAYER_SPAWN,
  ENTITY_TYPE_DEFAULTS,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
} from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { DefaultCyberiaItems } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { generateFallbackWorld } from '../../api/cyberia-instance/cyberia-fallback-world.js';

const logger = loggerFactory(import.meta);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, '../../../cyberia-server/gen/proto/cyberia.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).cyberia;

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function getModels(dbKey) {
  const bucket = DataBaseProviderService.getProvider(dbKey, 'mongoose');
  if (!bucket || !bucket.models) {
    throw new Error(`DataBaseProviderService not loaded for key "${dbKey}"`);
  }
  return bucket.models;
}

function normalizeEntityDefault(entityDefault = {}, canonical = {}) {
  const defaultObjectLayers = entityDefault.defaultObjectLayers ?? canonical.defaultObjectLayers ?? [];
  return {
    entityType: entityDefault.entityType ?? canonical.entityType ?? '',
    liveItemIds: [...(entityDefault.liveItemIds ?? canonical.liveItemIds ?? [])],
    deadItemIds: [...(entityDefault.deadItemIds ?? canonical.deadItemIds ?? [])],
    dropItemIds: [...(entityDefault.dropItemIds ?? canonical.dropItemIds ?? [])],
    defaultObjectLayers: defaultObjectLayers.map((ol) => ({
      itemId: ol.itemId || '',
      active: !!ol.active,
      quantity: ol.quantity || 0,
    })),
    behavior: entityDefault.behavior ?? canonical.behavior ?? '',
  };
}

// Merge instance-level itemIds flagged `defaultPlayerInventory` into the player
// entityDefault's defaultObjectLayers so cyberia-server seeds them into every new
// player's inventory (see handlers.go player spawn). Items are added inactive —
// present in the inventory, not auto-equipped — so they never violate the
// one-active-per-type equipment rule.
//
// Also **removes** items that are flagged `defaultPlayerInventory: false` from
// the player's defaultObjectLayers. This ensures the instance's explicit intent
// is honoured even when the conf's entityDefaults (e.g. from a backup/import)
// baked those items into the player layer list.
function applyInstanceDefaultPlayerInventory(config, instanceItemIds = []) {
  const entries = instanceItemIds || [];

  // ── 1. Remove items explicitly flagged as NOT default player inventory ─────
  const removeIds = new Set(
    entries.filter((entry) => entry && entry.defaultPlayerInventory === false && entry.id).map((entry) => entry.id),
  );
  if (removeIds.size > 0) {
    for (const ed of config.entityDefaults || []) {
      if (ed.defaultObjectLayers) {
        ed.defaultObjectLayers = ed.defaultObjectLayers.filter((ol) => !removeIds.has(ol.itemId));
      }
    }
  }

  // ── 2. Add items flagged as default player inventory ──────────────────────
  const addIds = entries.filter((entry) => entry && entry.defaultPlayerInventory && entry.id).map((entry) => entry.id);
  if (addIds.length === 0) return config;

  const playerDefault = (config.entityDefaults || []).find((d) => d.entityType === 'player');
  if (!playerDefault) return config;

  playerDefault.defaultObjectLayers = playerDefault.defaultObjectLayers || [];
  const existing = new Set(playerDefault.defaultObjectLayers.map((ol) => ol.itemId));
  for (const id of addIds) {
    if (existing.has(id)) continue;
    playerDefault.defaultObjectLayers.push({ itemId: id, active: false, quantity: 1 });
    existing.add(id);
  }
  return config;
}

// Map CyberiaSkill collection docs to the proto skillConfig shape. The skill
// collection is the authoritative own-model source: it carries full skill
// metadata (summonedEntityItemId, name, description) that the instance-conf
// skillConfig schema deliberately does not store.
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

// Load authoritative skill configs from the CyberiaSkill collection. Returns []
// when the model is not loaded (api not mounted) or the collection is empty, so
// callers transparently keep the conf / fallback skillConfig.
async function loadSkillConfigDocs(models) {
  if (!models.CyberiaSkill) return [];
  return await models.CyberiaSkill.find({}).lean();
}

// Map CyberiaEntityTypeDefault collection docs to the proto entityDefaults shape.
// This collection is the authoritative own-model source for per-entity-type item
// defaults (live/dead/drop + seed object layers). Resolution is by liveItemIds
// membership, so every variant (e.g. each resource skin) must travel as its own
// entry — never collapsed by entityType.
function entityTypeDefaultDocsToConfig(docs = []) {
  return docs
    .filter((d) => d && d.entityType)
    .map((d) => ({
      entityType: d.entityType,
      liveItemIds: [...(d.liveItemIds || [])],
      deadItemIds: [...(d.deadItemIds || [])],
      dropItemIds: [...(d.dropItemIds || [])],
      defaultObjectLayers: (d.defaultObjectLayers || []).map((ol) => ({
        itemId: ol.itemId,
        active: !!ol.active,
        quantity: ol.quantity || 0,
      })),
      behavior: d.behavior || '',
    }));
}

// Load authoritative entity-type defaults from the CyberiaEntityTypeDefault
// collection. Returns [] when the model is not mounted or empty, so callers
// transparently keep the conf / canonical entityDefaults.
async function loadEntityTypeDefaultDocs(models) {
  if (!models.CyberiaEntityTypeDefault) return [];
  return await models.CyberiaEntityTypeDefault.find({}).lean();
}

// Feed every live/dead/drop and default-object-layer item id from the collection
// defaults into the atlas id set so the Go server resolves their sprites even
// when the entity appears in no map (e.g. a new resource skin).
function addEntityDefaultAtlasIds(entityDefaults, atlasItemIds) {
  for (const d of entityDefaults || []) {
    for (const id of d.liveItemIds || []) if (id) atlasItemIds.add(id);
    for (const id of d.deadItemIds || []) if (id) atlasItemIds.add(id);
    for (const id of d.dropItemIds || []) if (id) atlasItemIds.add(id);
    for (const ol of d.defaultObjectLayers || []) if (ol.itemId) atlasItemIds.add(ol.itemId);
  }
}

// Feed skill trigger items and every concrete summoned-entity id into the atlas
// id set so the Go server resolves their sprites even when the entity appears in
// no map. Runtime placeholders ('$active_skin', …) are excluded.
function addSkillAtlasIds(skillDocs, atlasItemIds) {
  for (const d of skillDocs || []) {
    if (d.triggerItemId) atlasItemIds.add(d.triggerItemId);
    for (const sk of d.skills || []) {
      const id = sk.summonedEntityItemId;
      if (id && !id.startsWith('$')) atlasItemIds.add(id);
    }
  }
}

function mergeEntityDefaults(entityDefaults = []) {
  const merged = entityDefaults.map((entityDefault) => normalizeEntityDefault(entityDefault));
  const coveredTypes = new Set(merged.map((entityDefault) => entityDefault.entityType));
  for (const canonical of ENTITY_TYPE_DEFAULTS) {
    if (!coveredTypes.has(canonical.entityType)) merged.push(normalizeEntityDefault(canonical, canonical));
  }
  return merged;
}

// ── Mongoose doc → protobuf message converters ───────────────────

function toObjectLayerMsg(doc) {
  const d = doc.data || {};
  const item = d.item || {};
  const stats = d.stats || {};
  const ledger = d.ledger || {};
  const render = d.render || {};
  return {
    mongoId: String(doc._id),
    stats: {
      effect: stats.effect || 0,
      resistance: stats.resistance || 0,
      agility: stats.agility || 0,
      range: stats.range || 0,
      intelligence: stats.intelligence || 0,
      utility: stats.utility || 0,
    },
    item: {
      id: item.id || '',
      type: item.type || '',
      description: item.description || '',
      activable: !!item.activable,
    },
    ledger: {
      type: ledger.type || 'OFF_CHAIN',
      address: ledger.address || '',
      tokenId: ledger.tokenId || '',
    },
    render: {
      cid: render.cid || '',
      metadataCid: render.metadataCid || '',
    },
    sha256: doc.sha256 || '',
    cid: doc.cid || '',
  };
}

/**
 * Parse a CSS rgba() colour string into {r, g, b, a} integer components.
 * Returns {r:0, g:0, b:0, a:0} (transparent) when the string is absent or malformed.
 */
function parseRgba(str) {
  if (!str) return { r: 0, g: 0, b: 0, a: 0 };
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return { r: 0, g: 0, b: 0, a: 0 };
  // CSS alpha is 0-1 (float); proto uses 0-255 (int).
  const cssAlpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Math.round(cssAlpha * 255) };
}

function toEntityMsg(ent) {
  const rgba = parseRgba(ent.color);
  return {
    entityType: ent.entityType || 'floor',
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
        quantity: o.quantity || 1,
      })),
    })),
    rewards: (q.rewards || []).map((r) => ({ itemId: r.itemId || '', quantity: r.quantity || 1 })),
  };
}

/**
 * Converts a CyberiaInstanceConf Mongoose document (or plain object) into
 * a complete InstanceConfig proto message.
 * Any field that is null/undefined in `gc` falls back to FALLBACK_CONFIG_DEFAULTS,
 * so partial DB documents always produce a fully playable config.
 */
function toInstanceConfig(gc) {
  const fb = FALLBACK_CONFIG_DEFAULTS;
  if (!gc) return buildFallbackConfig();

  // STRICT BOUNDARY — this function produces the *simulation* config for
  // cyberia-server only. Every presentation concern is excluded:
  //
  //   - palette (colors), camera tunings, screen factors, devUi,
  //     interpolationMs, status-icon visuals, entityDefaults[].colorKey,
  //     cellSize, defaultObj* — all of these reach the client through
  //     /api/cyberia-client-hints, never through gRPC.
  //
  // The Go simulation does not need any of them to advance world state;
  // the C/WASM cyberia-client owns its own render policy. See
  // src/client/components/cyberia/SharedDefaultsCyberia.js.

  const gcDefaults = gc.entityDefaults && gc.entityDefaults.length > 0 ? gc.entityDefaults : [];
  const entityDefaults = mergeEntityDefaults(gcDefaults);

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
    playerBaseLifeRegenMin: gc.playerBaseLifeRegenMin ?? fb.playerBaseLifeRegenMin,
    playerBaseLifeRegenMax: gc.playerBaseLifeRegenMax ?? fb.playerBaseLifeRegenMax,
    sumStatsLimit: gc.sumStatsLimit ?? fb.sumStatsLimit,
    maxActiveLayers: gc.maxActiveLayers ?? fb.maxActiveLayers,
    initialLifeFraction: gc.initialLifeFraction ?? fb.initialLifeFraction,
    respawnDurationMs: gc.respawnDurationMs ?? fb.respawnDurationMs,
    collisionLifeLoss: gc.collisionLifeLoss ?? fb.collisionLifeLoss,
    // Economy — Fountain & Sink (nested, mirrors EconomyRules proto message).
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
    lifeRegenChance: gc.lifeRegenChance ?? fb.lifeRegenChance,
    maxChance: gc.maxChance ?? fb.maxChance,
    entityDefaults,
    skillConfig: (gc.skillConfig && gc.skillConfig.length > 0 ? gc.skillConfig : fb.skillConfig).map((sc) => ({
      triggerItemId: sc.triggerItemId || '',
      skills: (sc.skills || []).map((sk) => ({
        logicEventId: sk.logicEventId || '',
        name: sk.name || '',
        description: sk.description || '',
        summonedEntityItemId: sk.summonedEntityItemId || '',
      })),
    })),
    skillRules: {
      projectileSpawnChance: gc.skillRules?.projectileSpawnChance ?? fb.skillRules.projectileSpawnChance,
      projectileLifetimeMs: gc.skillRules?.projectileLifetimeMs ?? fb.skillRules.projectileLifetimeMs,
      projectileWidth: gc.skillRules?.projectileWidth ?? fb.skillRules.projectileWidth,
      projectileHeight: gc.skillRules?.projectileHeight ?? fb.skillRules.projectileHeight,
      projectileSpeedMultiplier: gc.skillRules?.projectileSpeedMultiplier ?? fb.skillRules.projectileSpeedMultiplier,
      doppelgangerSpawnChance: gc.skillRules?.doppelgangerSpawnChance ?? fb.skillRules.doppelgangerSpawnChance,
      doppelgangerLifetimeMs: gc.skillRules?.doppelgangerLifetimeMs ?? fb.skillRules.doppelgangerLifetimeMs,
      doppelgangerSpawnRadius: gc.skillRules?.doppelgangerSpawnRadius ?? fb.skillRules.doppelgangerSpawnRadius,
      doppelgangerInitialLifeFraction:
        gc.skillRules?.doppelgangerInitialLifeFraction ?? fb.skillRules.doppelgangerInitialLifeFraction,
    },
    // Equipment rules — governs activation constraints (nested, mirrors EquipmentRules proto message).
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
// RPC handler factory
// ═══════════════════════════════════════════════════════════════════

function buildHandlers(dbKey) {
  return {
    async ping(_call, callback) {
      callback(null, { serverTimeMs: Date.now() });
    },

    // Server-streaming: streams all ObjectLayers
    async getObjectLayerBatch(call) {
      try {
        const models = getModels(dbKey);
        const filter = {};
        if (call.request.itemTypeFilter) {
          filter['data.item.type'] = call.request.itemTypeFilter;
        }
        const cursor = models.ObjectLayer.find(filter).lean().cursor();
        for await (const doc of cursor) {
          call.write(toObjectLayerMsg(doc));
        }
        call.end();
      } catch (err) {
        logger.error('getObjectLayerBatch:', err);
        call.destroy(new Error(err.message));
      }
    },

    async getObjectLayer(call, callback) {
      try {
        const models = getModels(dbKey);
        const doc = await models.ObjectLayer.findOne({ 'data.item.id': call.request.itemId }).lean();
        if (!doc)
          return callback({ code: grpc.status.NOT_FOUND, message: `ObjectLayer "${call.request.itemId}" not found` });
        callback(null, toObjectLayerMsg(doc));
      } catch (err) {
        logger.error('getObjectLayer:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getMapData(call, callback) {
      try {
        const models = getModels(dbKey);
        const { mapCode, instanceCode } = call.request;
        const doc = await models.CyberiaMap.findOne({ code: mapCode }).lean();
        if (!doc) return callback({ code: grpc.status.NOT_FOUND, message: `Map "${mapCode}" not found` });

        // Track which instance is serving each mapCode in real time.
        // instanceCode is provided by the Go server in every GetMapData request.
        if (instanceCode) {
          models.GlobalMapCodeRegistry.findOneAndUpdate(
            { mapCode },
            { instanceCode, status: 'active' },
            { upsert: true, returnDocument: 'after', timestamps: true },
          ).catch((err) => logger.warn('getMapData registry update failed:', err.message));
        }

        callback(null, { map: toMapMsg(doc) });
      } catch (err) {
        logger.error('getMapData:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getFullInstance(call, callback) {
      try {
        const models = getModels(dbKey);
        // Normalise empty instanceCode to the canonical fallback name.
        const instanceCode = call.request.instanceCode || 'default';
        const inst = await models.CyberiaInstance.findOne({ code: instanceCode }).populate('conf').lean();

        // ── Fallback: instance not found → return a multi-map procedural world ──
        if (!inst) {
          logger.info(`Instance "${instanceCode}" not found — returning fallback world.`);
          const world = generateFallbackWorld();
          const fallbackConf = buildFallbackConfig();

          // Collect all objectLayerItemIds from the generated maps so the
          // Go server can resolve atlases at startup.
          const fallbackItemIds = new Set();
          for (const m of world.maps) {
            for (const e of m.entities || []) {
              for (const id of e.objectLayerItemIds || []) fallbackItemIds.add(id);
            }
          }
          // Also include system OL items from entity defaults.
          for (const d of fallbackConf.entityDefaults || []) {
            for (const id of d.liveItemIds || []) fallbackItemIds.add(id);
            for (const id of d.deadItemIds || []) fallbackItemIds.add(id);
            for (const id of d.dropItemIds || []) fallbackItemIds.add(id);
            for (const ol of d.defaultObjectLayers || []) {
              if (ol.itemId) fallbackItemIds.add(ol.itemId);
            }
          }
          // Include every canonical item so the Go server can resolve the type
          // of anything a player may pick up or equip (quest rewards like
          // hatchet, alt weapons, etc.) — required for the one-per-type
          // equipment rule, which silently no-ops when item type is unknown.
          for (const it of DefaultCyberiaItems || []) {
            if (it?.item?.id) fallbackItemIds.add(it.item.id);
          }

          // Own-model skills (if seeded) override the fallback skillConfig; their
          // summoned-entity atlases are resolved alongside the world's.
          const fallbackSkillDocs = await loadSkillConfigDocs(models);
          addSkillAtlasIds(fallbackSkillDocs, fallbackItemIds);

          // Own-model entity defaults (if seeded) override the fallback
          // entityDefaults; their live/dead/drop atlases resolve alongside.
          const fallbackEntityDefaultDocs = await loadEntityTypeDefaultDocs(models);
          const fallbackEntityDefaultsConfig = entityTypeDefaultDocsToConfig(fallbackEntityDefaultDocs);
          addEntityDefaultAtlasIds(fallbackEntityDefaultsConfig, fallbackItemIds);

          const fallbackOlDocs = fallbackItemIds.size
            ? await models.ObjectLayer.find({ 'data.item.id': { $in: [...fallbackItemIds] } }).lean()
            : [];

          const fallbackConfig = toInstanceConfig(fallbackConf);
          if (fallbackEntityDefaultsConfig.length)
            fallbackConfig.entityDefaults = mergeEntityDefaults(fallbackEntityDefaultsConfig);
          if (fallbackSkillDocs.length) fallbackConfig.skillConfig = skillDocsToConfig(fallbackSkillDocs);

          callback(null, {
            instance: toInstanceMsg({
              _id: '',
              code: 'fallback',
              name: 'Fallback Instance',
              description: 'Auto-generated procedural world (not persisted)',
              tags: ['fallback', 'procedural'],
              cyberiaMapCodes: world.instance.cyberiaMapCodes,
              portals: world.portals,
              topologyMode: 'procedural',
              seed: instanceCode,
              playerSpawn: world.instance.playerSpawn,
            }),
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
            objectLayers: fallbackOlDocs.map(toObjectLayerMsg),
            config: fallbackConfig,
            version: 'fallback',
            // Mission content for the procedural fallback comes straight from
            // the canonical defaults — no DB, fully self-contained.
            actions: DefaultCyberiaActions.map(toActionMsg),
            quests: DefaultCyberiaQuests.map(toQuestMsg),
          });
          return;
        }

        // ── Instance found — load maps + entity OLs + config default OLs ──────
        // `populate('conf')` returns null when the ObjectId ref is missing or
        // orphaned (e.g. after a --conf import that preserved a stale _id).
        // Fall back to a direct instanceCode lookup so aoiRadius and all other
        // tuning fields are always read from the database, never silently
        // replaced by FALLBACK_CONFIG_DEFAULTS.
        let conf = inst.conf;
        if (!conf) {
          conf = await models.CyberiaInstanceConf.findOne({ instanceCode }).lean();
          if (conf) {
            logger.warn(
              `getFullInstance: conf ref missing on instance "${instanceCode}" — resolved by instanceCode lookup`,
            );
          }
        }
        conf = conf || {};
        const mapCodes = inst.cyberiaMapCodes || [];
        const mapDocs = mapCodes.length ? await models.CyberiaMap.find({ code: { $in: mapCodes } }).lean() : [];

        // Collect all item IDs referenced by map entities.
        const itemIds = new Set();
        for (const m of mapDocs) {
          for (const e of m.entities || []) {
            for (const id of e.objectLayerItemIds || []) itemIds.add(id);
          }
        }

        // Instance-level itemIds (e.g. default-player-inventory items) may not
        // appear in any map entity — include them so their atlases resolve.
        // Tolerate legacy flat-string entries alongside the { id, … } shape.
        for (const entry of inst.itemIds || []) {
          const id = typeof entry === 'string' ? entry : entry?.id;
          if (id) itemIds.add(id);
        }

        // Authoritative per-entity-type defaults come from the
        // CyberiaEntityTypeDefault collection (own model); empty collection leaves
        // the conf/canonical defaults in place.
        const entityDefaultDocs = await loadEntityTypeDefaultDocs(models);
        const entityDefaultsConfig = entityTypeDefaultDocsToConfig(entityDefaultDocs);

        // Include system OL items from canonical ENTITY_TYPE_DEFAULTS, the DB conf,
        // AND the collection so the Go server always caches every default atlas
        // even when an entity (e.g. a new resource skin) appears in no map.
        for (const d of [...ENTITY_TYPE_DEFAULTS, ...(conf.entityDefaults || [])]) {
          for (const id of d.liveItemIds || []) itemIds.add(id);
          for (const id of d.deadItemIds || []) itemIds.add(id);
          for (const id of d.dropItemIds || []) itemIds.add(id);
          for (const ol of d.defaultObjectLayers || []) {
            if (ol.itemId) itemIds.add(ol.itemId);
          }
        }
        addEntityDefaultAtlasIds(entityDefaultsConfig, itemIds);

        // Authoritative skills come from the CyberiaSkill collection (own model);
        // resolve their atlases before the OL query so summoned entities render.
        const skillDocs = await loadSkillConfigDocs(models);
        addSkillAtlasIds(skillDocs, itemIds);

        const olDocs = itemIds.size
          ? await models.ObjectLayer.find({ 'data.item.id': { $in: [...itemIds] } }).lean()
          : [];

        // Opaque version string from updatedAt timestamps — the Go server
        // compares this to skip full world rebuilds when nothing changed.
        const versionParts = [String(inst.updatedAt || inst._id)];
        for (const m of mapDocs) versionParts.push(String(m.updatedAt || m._id));
        if (conf.updatedAt) versionParts.push(String(conf.updatedAt));
        // Skill edits live in their own collection — fold them in so a skill
        // change triggers a Go-side world rebuild instead of serving stale skills.
        for (const sk of skillDocs) versionParts.push(String(sk.updatedAt || sk._id));
        // Entity-type-default edits live in their own collection too — fold them
        // in so adding/editing a default (e.g. a new resource) rebuilds the world.
        for (const ed of entityDefaultDocs) versionParts.push(String(ed.updatedAt || ed._id));
        const version = crypto.createHash('sha256').update(versionParts.join('|')).digest('hex');

        // Mission content for this instance: actions and quests bound to its
        // maps (by sourceMapCode). Delivered with the world so the Go server
        // never opens a separate REST channel, and never receives content from
        // other instances' maps.
        const actionDocs =
          mapCodes.length && models.CyberiaAction
            ? await models.CyberiaAction.find({ sourceMapCode: { $in: mapCodes } }).lean()
            : [];
        const questDocs =
          mapCodes.length && models.CyberiaQuest
            ? await models.CyberiaQuest.find({ sourceMapCode: { $in: mapCodes } }).lean()
            : [];

        const baseConfig = toInstanceConfig(conf);
        // Own-model entity defaults win over the conf's entityDefaults (overlaid on
        // canonical via mergeEntityDefaults), so every collection variant — e.g.
        // each resource skin — reaches the Go runtime keyed by liveItemIds. Applied
        // BEFORE default-player-inventory so the player layer additions survive.
        if (entityDefaultsConfig.length) baseConfig.entityDefaults = mergeEntityDefaults(entityDefaultsConfig);
        const config = applyInstanceDefaultPlayerInventory(baseConfig, inst.itemIds);
        // Own-model skills win over the conf's stripped skillConfig (which lacks
        // summonedEntityItemId); empty collection leaves the conf/fallback as-is.
        if (skillDocs.length) config.skillConfig = skillDocsToConfig(skillDocs);

        callback(null, {
          instance: toInstanceMsg(inst),
          maps: mapDocs.map(toMapMsg),
          objectLayers: olDocs.map(toObjectLayerMsg),
          config,
          version,
          actions: actionDocs.map(toActionMsg),
          quests: questDocs.map(toQuestMsg),
        });
      } catch (err) {
        logger.error('getFullInstance:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getObjectLayerManifest(_call, callback) {
      try {
        const models = getModels(dbKey);
        const docs = await models.ObjectLayer.find({}, { 'data.item.id': 1, sha256: 1 }).lean();
        callback(null, {
          entries: docs.map((d) => ({ itemId: d.data?.item?.id || '', sha256: d.sha256 || '' })),
        });
      } catch (err) {
        logger.error('getObjectLayerManifest:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Server lifecycle
// ═══════════════════════════════════════════════════════════════════

class GrpcServer {
  static _server = null;

  /**
   * @param {Object} opts
   * @param {string} opts.host  - DataBaseProviderService host key
   * @param {string} opts.path  - DataBaseProviderService path key
   * @param {number} [opts.port=50051]
   */
  static async start({ host, path: dbPath, port = 50051 } = {}) {
    const dbKey = `${host}${dbPath}`;
    const server = new grpc.Server({
      'grpc.max_send_message_length': 64 * 1024 * 1024,
      'grpc.max_receive_message_length': 16 * 1024 * 1024,
    });

    server.addService(proto.CyberiaDataService.service, buildHandlers(dbKey));

    // gRPC runs over Kubernetes internal network (ClusterIP) — always insecure
    const creds = grpc.ServerCredentials.createInsecure();

    return new Promise((resolve, reject) => {
      server.bindAsync(`0.0.0.0:${port}`, creds, (err) => {
        if (err) {
          logger.error('gRPC bind failed:', err);
          return reject(err);
        }
        GrpcServer._server = server;
        logger.info(`gRPC server listening on 0.0.0.0:${port}`);
        resolve(server);
      });
    });
  }

  static async stop() {
    if (!GrpcServer._server) return;
    return new Promise((resolve) => {
      GrpcServer._server.tryShutdown(() => {
        GrpcServer._server = null;
        logger.info('gRPC server stopped');
        resolve();
      });
    });
  }
}

export { GrpcServer };
