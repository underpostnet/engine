/**
 * Fallback World Generator — pure-function module.
 *
 * Produces a complete in-memory multi-map world with portal topology,
 * floor tiles, obstacles, foreground, and bots.  Nothing is persisted
 * to MongoDB — the result is regenerated on every call.
 *
 * Everything that can be random IS random (counts within ranges,
 * positions, dimensions).  The floor is the exception: it deterministically
 * covers the entire map grid so there are no gaps.
 *
 * Shared by:
 *   - gRPC server (getFullInstance fallback path)
 *   - CyberiaInstanceService (API / GUI fallback endpoint)
 *
 * All exported functions are stateless and synchronous.
 *
 * @module src/api/cyberia-instance/cyberia-fallback-world
 */

import {
  connectPortals,
  generateObstacles,
  generateForeground,
  colorToRgba,
  findColor,
  randInt,
  BOT_RANGE,
  BOT_WEAPON_CHANCE,
  PORTAL_DIM_RANGE,
} from './cyberia-portal-connector.js';

import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  ENTITY_TYPE_DEFAULTS,
} from '../cyberia-instance-conf/cyberia-instance-conf.defaults.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAP_COUNT = 4;
const DEFAULT_GRID_SIZE = 64;
const DEFAULT_FLOOR_TILE_DIM = 4;
const DEFAULT_BOT_DIM_RANGE = [2, 3];

// ── Floor generator ──────────────────────────────────────────────────────────

/**
 * Generate floor tiles that cover the entire map grid.
 * Floor is NOT random — it tiles deterministically so every cell is covered.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {object} [opts]
 * @param {number} [opts.tileDim=4]  Floor tile size in cells.
 * @returns {object[]}
 */
function generateFloorEntities(mapDims, colors, opts = {}) {
  const { tileDim = DEFAULT_FLOOR_TILE_DIM } = opts;
  const floorDefault = ENTITY_TYPE_DEFAULTS.find((d) => d.entityType === 'floor');
  const floorItemIds = floorDefault?.liveItemIds?.length ? [...floorDefault.liveItemIds] : [];
  const floorColor = findColor(colors, 'FLOOR');
  const rgba = floorColor ? colorToRgba(floorColor) : '';

  const entities = [];
  for (let y = 0; y < mapDims.gridY; y += tileDim) {
    for (let x = 0; x < mapDims.gridX; x += tileDim) {
      entities.push({
        entityType: 'floor',
        initCellX: x,
        initCellY: y,
        dimX: Math.min(tileDim, mapDims.gridX - x),
        dimY: Math.min(tileDim, mapDims.gridY - y),
        color: rgba,
        objectLayerItemIds: floorItemIds,
      });
    }
  }
  return entities;
}

// ── Portal entity generator ──────────────────────────────────────────────────

/**
 * Generate a portal entity at a random position with random dimensions.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @returns {object}
 */
function generatePortalEntity(mapDims, colors) {
  const portalColor = findColor(colors, 'PORTAL');
  const rgba = portalColor ? colorToRgba(portalColor) : 'rgba(0, 200, 200, 1)';
  const dimX = randInt(PORTAL_DIM_RANGE[0], PORTAL_DIM_RANGE[1]);
  const dimY = randInt(PORTAL_DIM_RANGE[0], PORTAL_DIM_RANGE[1]);
  const maxX = Math.max(0, mapDims.gridX - dimX);
  const maxY = Math.max(0, mapDims.gridY - dimY);
  return {
    entityType: 'portal',
    initCellX: randInt(0, maxX),
    initCellY: randInt(0, maxY),
    dimX,
    dimY,
    color: rgba,
    objectLayerItemIds: [],
  };
}

// ── Bot generator ────────────────────────────────────────────────────────────

/**
 * Generate bot entities for a map.
 *
 * - All bots use the `purple` skin + `atlas_pistol_mk2` weapon.
 * - Random count within BOT_RANGE, random positions, random dimensions.
 * - Uses the BOT palette color as fallback.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {object} [opts]
 * @param {number} [opts.count]         Override count (ignores range).
 * @param {number} [opts.spawnRadius]
 * @param {number} [opts.aggroRange]
 * @param {number} [opts.maxLife]
 * @returns {object[]}
 */
function generateBots(mapDims, colors, opts = {}) {
  const count = opts.count ?? randInt(BOT_RANGE[0], BOT_RANGE[1]);
  const { spawnRadius = 5, aggroRange = 10, maxLife = 100 } = opts;
  const botColor = findColor(colors, 'BOT');
  const rgba = botColor ? colorToRgba(botColor) : 'rgba(255, 128, 0, 1)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const dim = randInt(DEFAULT_BOT_DIM_RANGE[0], DEFAULT_BOT_DIM_RANGE[1]);
    const maxX = Math.max(0, mapDims.gridX - dim);
    const maxY = Math.max(0, mapDims.gridY - dim);

    const hasWeapon = Math.random() < BOT_WEAPON_CHANCE;
    const itemIds = hasWeapon ? ['purple', 'atlas_pistol_mk2'] : ['purple'];

    entities.push({
      entityType: 'bot',
      initCellX: randInt(0, maxX),
      initCellY: randInt(0, maxY),
      dimX: dim,
      dimY: dim,
      color: rgba,
      objectLayerItemIds: itemIds,
      spawnRadius,
      aggroRange,
      maxLife,
      lifeRegen: 0,
    });
  }
  return entities;
}

// ── Single map generator ─────────────────────────────────────────────────────

/**
 * Generate a complete in-memory map with all entity types.
 * Everything except floor tiles is randomized.
 *
 * @param {string} mapCode
 * @param {Array} colors             Palette from CYBERIA_INSTANCE_CONF_DEFAULTS.
 * @param {object} [opts]
 * @param {number} [opts.gridSize]
 * @param {number} [opts.obstacleCount]
 * @param {number} [opts.foregroundCount]
 * @param {number} [opts.botCount]
 * @returns {object}  CyberiaMap-shaped plain object.
 */
function generateFallbackMap(mapCode, colors, opts = {}) {
  const gridSize = opts.gridSize || DEFAULT_GRID_SIZE;
  const mapDims = { gridX: gridSize, gridY: gridSize };

  const entities = [
    // Floor — deterministic full coverage (not random)
    ...generateFloorEntities(mapDims, colors),
    // Portal — random position and dimensions
    generatePortalEntity(mapDims, colors),
    // Obstacles — random count, position, dimensions
    ...generateObstacles(mapDims, colors, { count: opts.obstacleCount }),
    // Foreground — random count, position, dimensions
    ...generateForeground(mapDims, colors, { count: opts.foregroundCount }),
    // Bots — random count, position, dimensions; all armed
    ...generateBots(mapDims, colors, { count: opts.botCount }),
  ];

  return {
    code: mapCode,
    name: `Fallback ${mapCode}`,
    gridX: gridSize,
    gridY: gridSize,
    cellWidth: 32,
    cellHeight: 32,
    entities,
  };
}

// ── Full world generator ─────────────────────────────────────────────────────

/**
 * Generate a complete in-memory fallback world: multiple maps connected
 * by a portal ring topology.
 *
 * Returns a plain-object structure matching what a real CyberiaInstance
 * + CyberiaMap query would return, so consumers can treat it identically.
 *
 * Nothing is persisted to MongoDB.
 *
 * @param {object} [opts]
 * @param {number} [opts.mapCount=4]          Number of maps to generate.
 * @param {number} [opts.gridSize=64]         Grid size per map.
 * @param {number} [opts.obstacleCount]       Obstacles per map (random if omitted).
 * @param {number} [opts.foregroundCount]     Foreground entities per map (random if omitted).
 * @param {number} [opts.botCount]            Bots per map (random if omitted).
 * @param {Array}  [opts.colors]              Override palette.
 * @returns {{
 *   instance: object,
 *   maps: object[],
 *   portals: object[],
 *   topology: string,
 *   config: object,
 *   _fallback: true
 * }}
 */
function generateFallbackWorld(opts = {}) {
  const {
    mapCount = DEFAULT_MAP_COUNT,
    gridSize,
    obstacleCount,
    foregroundCount,
    botCount,
    colors = CYBERIA_INSTANCE_CONF_DEFAULTS.colors,
  } = opts;

  // Generate map codes.
  const mapCodes = [];
  for (let i = 0; i < mapCount; i++) {
    mapCodes.push(`fallback-map-${i}`);
  }

  // Generate each map (all randomized independently).
  const maps = mapCodes.map((code) =>
    generateFallbackMap(code, colors, {
      gridSize,
      obstacleCount,
      foregroundCount,
      botCount,
    }),
  );

  // Connect maps with portal topology using the portal connector module.
  const { portals, topology } = connectPortals(mapCodes, maps);

  // Build the instance shell (never persisted — no mongoId).
  const instance = {
    code: 'fallback',
    name: 'Fallback Instance',
    description: 'Auto-generated procedural world (not persisted)',
    tags: ['fallback', 'procedural'],
    cyberiaMapCodes: mapCodes,
    portals,
    topologyMode: 'procedural',
  };

  return {
    instance,
    maps,
    portals,
    topology,
    config: CYBERIA_INSTANCE_CONF_DEFAULTS,
    _fallback: true,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export { generateFallbackWorld, generateFallbackMap, generateFloorEntities, generatePortalEntity, generateBots };
