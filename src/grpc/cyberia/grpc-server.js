/**
 * gRPC server for the Cyberia Engine data pipeline.
 *
 * Runs alongside Express on a separate port (default 50051).
 * Provides read-only RPCs for the Go game server to fetch
 * ObjectLayers, AtlasSpriteSheets, Instances, and Maps from MongoDB.
 *
 * @module src/grpc/cyberia/grpc-server.js
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

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

function toFrameList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((f) => ({
    x: f.x || 0,
    y: f.y || 0,
    width: f.width || 0,
    height: f.height || 0,
    frameIndex: f.frameIndex || 0,
  }));
}

function toAtlasMsg(doc) {
  const m = doc.metadata || {};
  const fr = m.frames || {};
  return {
    mongoId: String(doc._id),
    fileId: doc.fileId ? String(doc.fileId) : '',
    cid: doc.cid || '',
    itemKey: m.itemKey || '',
    atlasWidth: m.atlasWidth || 0,
    atlasHeight: m.atlasHeight || 0,
    cellPixelDim: m.cellPixelDim || 20,
    frames: {
      upIdle: toFrameList(fr.up_idle),
      downIdle: toFrameList(fr.down_idle),
      rightIdle: toFrameList(fr.right_idle),
      leftIdle: toFrameList(fr.left_idle),
      upRightIdle: toFrameList(fr.up_right_idle),
      downRightIdle: toFrameList(fr.down_right_idle),
      upLeftIdle: toFrameList(fr.up_left_idle),
      downLeftIdle: toFrameList(fr.down_left_idle),
      defaultIdle: toFrameList(fr.default_idle),
      upWalking: toFrameList(fr.up_walking),
      downWalking: toFrameList(fr.down_walking),
      rightWalking: toFrameList(fr.right_walking),
      leftWalking: toFrameList(fr.left_walking),
      upRightWalking: toFrameList(fr.up_right_walking),
      downRightWalking: toFrameList(fr.down_right_walking),
      upLeftWalking: toFrameList(fr.up_left_walking),
      downLeftWalking: toFrameList(fr.down_left_walking),
      noneIdle: toFrameList(fr.none_idle),
    },
  };
}

function toEntityMsg(ent) {
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
  const colors =
    gc.colors && gc.colors.length > 0
      ? gc.colors.map((c) => ({
          key: c.key || '',
          r: c.r ?? 0,
          g: c.g ?? 0,
          b: c.b ?? 0,
          a: c.a ?? 255,
        }))
      : fb.colors.map((c) => ({ ...c }));
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
    defaultPlayerObjectLayers: (gc.defaultPlayerObjectLayers || []).map((ol) => ({
      itemId: ol.itemId || '',
      active: !!ol.active,
      quantity: ol.quantity || 0,
    })),
    respawnDurationMs: gc.respawnDurationMs ?? fb.respawnDurationMs,
    ghostItemId: gc.ghostItemId ?? fb.ghostItemId,
    collisionLifeLoss: gc.collisionLifeLoss ?? fb.collisionLifeLoss,
    coinItemId: gc.coinItemId ?? fb.coinItemId,
    defaultCoinQuantity: gc.defaultCoinQuantity ?? fb.defaultCoinQuantity,
    lifeRegenChance: gc.lifeRegenChance ?? fb.lifeRegenChance,
    maxChance: gc.maxChance ?? fb.maxChance,
    defaultFloorItemId: gc.defaultFloorItemId ?? fb.defaultFloorItemId,
    skillConfig: (gc.skillConfig || []).map((sc) => ({
      triggerItemId: sc.triggerItemId || '',
      logicEventIds: sc.logicEventIds || [],
    })),
    skillRules: {
      bulletSpawnChance: gc.skillRules?.bulletSpawnChance ?? fb.skillRules.bulletSpawnChance,
      bulletLifetimeMs: gc.skillRules?.bulletLifetimeMs ?? fb.skillRules.bulletLifetimeMs,
      bulletWidth: gc.skillRules?.bulletWidth ?? fb.skillRules.bulletWidth,
      bulletHeight: gc.skillRules?.bulletHeight ?? fb.skillRules.bulletHeight,
      bulletSpeedMultiplier: gc.skillRules?.bulletSpeedMultiplier ?? fb.skillRules.bulletSpeedMultiplier,
      doppelgangerSpawnChance: gc.skillRules?.doppelgangerSpawnChance ?? fb.skillRules.doppelgangerSpawnChance,
      doppelgangerLifetimeMs: gc.skillRules?.doppelgangerLifetimeMs ?? fb.skillRules.doppelgangerLifetimeMs,
      doppelgangerSpawnRadius: gc.skillRules?.doppelgangerSpawnRadius ?? fb.skillRules.doppelgangerSpawnRadius,
      doppelgangerInitialLifeFraction:
        gc.skillRules?.doppelgangerInitialLifeFraction ?? fb.skillRules.doppelgangerInitialLifeFraction,
    },
  };
}

/**
 * Canonical fallback server configuration values.
 * Single source of truth used by:
 *   - buildFallbackConfig()  — when no instance exists in DB
 *   - toInstanceConfig()     — to fill missing/zero fields from a partial conf document
 */
const FALLBACK_CONFIG_DEFAULTS = {
  cellSize: 64,
  fps: 60,
  interpolationMs: 100,
  defaultObjWidth: 1,
  defaultObjHeight: 1,
  cameraSmoothing: 0.1,
  cameraZoom: 1.0,
  defaultWidthScreenFactor: 1,
  defaultHeightScreenFactor: 1,
  devUi: false,
  colors: [
    { key: 'BACKGROUND', r: 30, g: 30, b: 30, a: 255 },
    { key: 'FLOOR_BACKGROUND', r: 45, g: 45, b: 45, a: 255 },
    { key: 'FLOOR', r: 60, g: 60, b: 60, a: 255 },
    { key: 'OBSTACLE', r: 80, g: 80, b: 80, a: 255 },
    { key: 'PORTAL', r: 0, g: 200, b: 200, a: 255 },
    { key: 'PLAYER', r: 0, g: 255, b: 0, a: 255 },
    { key: 'OTHER_PLAYER', r: 128, g: 128, b: 255, a: 255 },
    { key: 'BOT', r: 255, g: 128, b: 0, a: 255 },
  ],
  aoiRadius: 10,
  portalHoldTimeMs: 1000,
  portalSpawnRadius: 3,
  entityBaseSpeed: 5,
  entityBaseMaxLife: 100,
  entityBaseActionCooldownMs: 500,
  entityBaseMinActionCooldownMs: 100,
  botAggroRange: 10,
  defaultPlayerWidth: 2,
  defaultPlayerHeight: 2,
  playerBaseLifeRegenMin: 0.5,
  playerBaseLifeRegenMax: 1.5,
  sumStatsLimit: 500,
  maxActiveLayers: 4,
  initialLifeFraction: 1.0,
  defaultPlayerObjectLayers: [],
  respawnDurationMs: 3000,
  ghostItemId: '',
  collisionLifeLoss: 10,
  coinItemId: '',
  defaultCoinQuantity: 1,
  lifeRegenChance: 300,
  maxChance: 10000,
  defaultFloorItemId: '',
  skillConfig: [],
  skillRules: {
    bulletSpawnChance: 0,
    bulletLifetimeMs: 0,
    bulletWidth: 0,
    bulletHeight: 0,
    bulletSpeedMultiplier: 0,
    doppelgangerSpawnChance: 0,
    doppelgangerLifetimeMs: 0,
    doppelgangerSpawnRadius: 0,
    doppelgangerInitialLifeFraction: 0,
  },
};

/**
 * Builds a minimal InstanceConfig with playable defaults.
 * Used when the requested instance does not exist in the database.
 * No entities, no skills, no items — just enough for the Go server
 * to create an empty map where player entities can connect and move.
 * Players are rendered as solid colored rectangles (entity.color).
 */
function buildFallbackConfig() {
  return JSON.parse(JSON.stringify(FALLBACK_CONFIG_DEFAULTS));
}

/**
 * Generates a minimal 64×64 map of 4×4-cell floor tiles.
 * Used when the requested instance has no maps, or as the fallback instance map.
 * @param {string} mapCode
 */
function buildFallbackMap(mapCode) {
  const gridSize = 64;
  const tileDim = 4;
  const floorColor = 'rgba(60,60,60,1)';
  const floors = [];
  for (let r = 0; r < gridSize; r += tileDim) {
    for (let c = 0; c < gridSize; c += tileDim) {
      floors.push({
        entityType: 'floor',
        initCellX: c,
        initCellY: r,
        dimX: tileDim,
        dimY: tileDim,
        color: floorColor,
        objectLayerItemIds: [],
        spawnRadius: 0,
        aggroRange: 0,
        maxLife: 0,
        lifeRegen: 0,
      });
    }
  }
  return {
    mongoId: '',
    code: mapCode,
    name: 'Fallback Map',
    gridX: gridSize,
    gridY: gridSize,
    cellWidth: 32,
    cellHeight: 32,
    entities: floors,
  };
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

    async getAtlasSpriteSheet(call, callback) {
      try {
        const models = getModels(dbKey);
        const doc = await models.AtlasSpriteSheet.findOne({ 'metadata.itemKey': call.request.itemKey }).lean();
        if (!doc)
          return callback({ code: grpc.status.NOT_FOUND, message: `Atlas "${call.request.itemKey}" not found` });
        callback(null, toAtlasMsg(doc));
      } catch (err) {
        logger.error('getAtlasSpriteSheet:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getAtlasSpriteSheetBatch(call) {
      try {
        const models = getModels(dbKey);
        const cursor = models.AtlasSpriteSheet.find({}).lean().cursor();
        for await (const doc of cursor) {
          call.write(toAtlasMsg(doc));
        }
        call.end();
      } catch (err) {
        logger.error('getAtlasSpriteSheetBatch:', err);
        call.destroy(new Error(err.message));
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

        // ── Fallback: instance not found → return a minimal playable instance ──
        if (!inst) {
          logger.info(`Instance "${instanceCode}" not found — returning fallback instance.`);
          const fallbackMapCode = 'fallback-map-0';
          callback(null, {
            instance: {
              mongoId: '',
              code: instanceCode,
              name: 'Fallback Instance',
              description: 'Auto-generated minimal instance',
              tags: [],
              mapCodes: [fallbackMapCode],
              portals: [],
              topologyMode: 'manual',
              seed: '',
            },
            maps: [buildFallbackMap(fallbackMapCode)],
            objectLayers: [],
            config: buildFallbackConfig(),
          });
          return;
        }

        const mapCodes = inst.cyberiaMapCodes || [];
        const mapDocs = mapCodes.length ? await models.CyberiaMap.find({ code: { $in: mapCodes } }).lean() : [];

        const itemIds = new Set();
        for (const m of mapDocs) {
          for (const e of m.entities || []) {
            for (const id of e.objectLayerItemIds || []) itemIds.add(id);
          }
        }
        const olDocs = itemIds.size
          ? await models.ObjectLayer.find({ 'data.item.id': { $in: [...itemIds] } })
              .populate('objectLayerRenderFramesId', { _id: 1, frame_duration: 1, is_stateless: 1 })
              .lean()
          : [];

        callback(null, {
          instance: toInstanceMsg(inst),
          maps: mapDocs.map(toMapMsg),
          objectLayers: olDocs.map(toObjectLayerMsg),
          config: toInstanceConfig(inst.conf),
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
