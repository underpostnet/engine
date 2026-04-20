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
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS as FALLBACK_CONFIG_DEFAULTS,
  ENTITY_TYPE_DEFAULTS,
  STATUS_ICONS,
} from '../../api/cyberia-instance-conf/cyberia-instance-conf.defaults.js';
import { generateFallbackWorld } from '../../api/cyberia-instance/cyberia-fallback-world.js';

const logger = loggerFactory(import.meta);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, '../../../cyberia-server/proto/cyberia.proto');

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
  const bucket = DataBaseProvider.instance[dbKey];
  if (!bucket || !bucket.mongoose || !bucket.mongoose.models) {
    throw new Error(`DataBaseProvider not loaded for key "${dbKey}"`);
  }
  return bucket.mongoose.models;
}

// ── Mongoose doc → protobuf message converters ───────────────────

function toObjectLayerMsg(doc) {
  const d = doc.data || {};
  const item = d.item || {};
  const stats = d.stats || {};
  const ledger = d.ledger || {};
  const render = d.render || {};
  const rf = doc.objectLayerRenderFramesId;
  let frameDuration = 250;
  let isStateless = false;
  if (rf && typeof rf === 'object') {
    if (rf.frame_duration != null) frameDuration = rf.frame_duration;
    if (rf.is_stateless != null) isStateless = rf.is_stateless;
  }
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
    frameDuration,
    isStateless,
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

  // Per-key merge: start with canonical defaults, overlay any DB-defined colours.
  const dbColorMap = new Map((gc.colors || []).map((c) => [c.key, c]));
  const colors = fb.colors.map((c) => {
    const ov = dbColorMap.get(c.key);
    return ov ? { key: c.key, r: ov.r ?? c.r, g: ov.g ?? c.g, b: ov.b ?? c.b, a: ov.a ?? c.a } : { ...c };
  });
  // Append any DB colours whose keys are absent from the canonical defaults.
  for (const [key, c] of dbColorMap) {
    if (!colors.some((fc) => fc.key === key)) {
      colors.push({ key, r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 255 });
    }
  }

  // Merge entity defaults: use canonical ENTITY_TYPE_DEFAULTS as base, overlay with
  // any instance-specific overrides stored in gc.entityDefaults.
  const gcDefaults = gc.entityDefaults && gc.entityDefaults.length > 0 ? gc.entityDefaults : [];
  const gcDefaultsMap = Object.fromEntries(gcDefaults.map((d) => [d.entityType, d]));
  const entityDefaults = ENTITY_TYPE_DEFAULTS.map((canonical) => {
    const override = gcDefaultsMap[canonical.entityType] ?? {};
    const dols = override.defaultObjectLayers ?? canonical.defaultObjectLayers ?? [];
    return {
      entityType: canonical.entityType,
      liveItemIds: override.liveItemIds ?? canonical.liveItemIds,
      deadItemIds: override.deadItemIds ?? canonical.deadItemIds,
      colorKey: override.colorKey ?? canonical.colorKey,
      defaultObjectLayers: dols.map((ol) => ({
        itemId: ol.itemId || '',
        active: !!ol.active,
        quantity: ol.quantity || 0,
      })),
    };
  });

  return {
    cellSize: gc.cellSize ?? fb.cellSize,
    fps: gc.fps ?? fb.fps,
    interpolationMs: gc.interpolationMs ?? fb.interpolationMs,
    defaultObjWidth: gc.defaultObjWidth ?? fb.defaultObjWidth,
    defaultObjHeight: gc.defaultObjHeight ?? fb.defaultObjHeight,
    cameraSmoothing: gc.cameraSmoothing ?? fb.cameraSmoothing,
    cameraZoom: gc.cameraZoom ?? fb.cameraZoom,
    defaultWidthScreenFactor: gc.defaultWidthScreenFactor ?? fb.defaultWidthScreenFactor,
    defaultHeightScreenFactor: gc.defaultHeightScreenFactor ?? fb.defaultHeightScreenFactor,
    devUi: gc.devUi ?? fb.devUi,
    colors,
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
    // Status icon mapping — u8 ID → icon filename stem + border colour.
    // Border colours come from the frozen STATUS_ICONS constant (canonical
    // source of truth).  DB entries may override iconId but borderColor is
    // always canonical — the DB schema defaults are generic grey, not the
    // actual per-status colours.
    statusIcons: STATUS_ICONS.map((canon) => {
      const dbEntry = (gc.statusIcons || []).find((s) => s.id === canon.id);
      const bc = canon.borderColor || {};
      return {
        id: canon.id,
        iconId: (dbEntry && dbEntry.iconId) || canon.iconId || '',
        borderColorR: bc.r ?? 100,
        borderColorG: bc.g ?? 100,
        borderColorB: bc.b ?? 100,
        borderColorA: bc.a ?? 200,
      };
    }),
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
        const cursor = models.ObjectLayer.find(filter)
          .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1, is_stateless: 1 })
          .lean()
          .cursor();
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
        const doc = await models.ObjectLayer.findOne({ 'data.item.id': call.request.itemId })
          .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1, is_stateless: 1 })
          .lean();
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
            { upsert: true, new: true, timestamps: true },
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
            for (const ol of d.defaultObjectLayers || []) {
              if (ol.itemId) fallbackItemIds.add(ol.itemId);
            }
          }

          const fallbackOlDocs = fallbackItemIds.size
            ? await models.ObjectLayer.find({ 'data.item.id': { $in: [...fallbackItemIds] } })
                .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1, is_stateless: 1 })
                .lean()
            : [];

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
            config: toInstanceConfig(fallbackConf),
            version: 'fallback',
          });
          return;
        }

        // ── Instance found — load maps + entity OLs + config default OLs ──────
        const conf = inst.conf || {};
        const mapCodes = inst.cyberiaMapCodes || [];
        const mapDocs = mapCodes.length ? await models.CyberiaMap.find({ code: { $in: mapCodes } }).lean() : [];

        // Collect all item IDs referenced by map entities.
        const itemIds = new Set();
        for (const m of mapDocs) {
          for (const e of m.entities || []) {
            for (const id of e.objectLayerItemIds || []) itemIds.add(id);
          }
        }

        // Include system OL items from BOTH canonical ENTITY_TYPE_DEFAULTS AND
        // the DB conf so the Go server always caches all default atlases even if
        // the DB doc has incomplete entityDefaults.
        for (const d of [...ENTITY_TYPE_DEFAULTS, ...(conf.entityDefaults || [])]) {
          for (const id of d.liveItemIds || []) itemIds.add(id);
          for (const id of d.deadItemIds || []) itemIds.add(id);
          for (const ol of d.defaultObjectLayers || []) {
            if (ol.itemId) itemIds.add(ol.itemId);
          }
        }

        const olDocs = itemIds.size
          ? await models.ObjectLayer.find({ 'data.item.id': { $in: [...itemIds] } })
              .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1, is_stateless: 1 })
              .lean()
          : [];

        // Opaque version string from updatedAt timestamps — the Go server
        // compares this to skip full world rebuilds when nothing changed.
        const versionParts = [String(inst.updatedAt || inst._id)];
        for (const m of mapDocs) versionParts.push(String(m.updatedAt || m._id));
        if (conf.updatedAt) versionParts.push(String(conf.updatedAt));
        const version = crypto.createHash('sha256').update(versionParts.join('|')).digest('hex');

        callback(null, {
          instance: toInstanceMsg(inst),
          maps: mapDocs.map(toMapMsg),
          objectLayers: olDocs.map(toObjectLayerMsg),
          config: toInstanceConfig(conf),
          version,
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

const GrpcServer = {
  _server: null,

  /**
   * @param {Object} opts
   * @param {string} opts.host  - DataBaseProvider host key
   * @param {string} opts.path  - DataBaseProvider path key
   * @param {number} [opts.port=50051]
   */
  async start({ host, path: dbPath, port = 50051 } = {}) {
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
  },

  async stop() {
    if (!GrpcServer._server) return;
    return new Promise((resolve) => {
      GrpcServer._server.tryShutdown(() => {
        GrpcServer._server = null;
        logger.info('gRPC server stopped');
        resolve();
      });
    });
  },
};

export { GrpcServer };
