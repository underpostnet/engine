/**
 * Fallback World Generator — pure-function module.
 *
 * Produces a complete in-memory multi-map world with portal topology,
 * floor tiles, obstacles, foreground, and bots.  Nothing is persisted
 * to MongoDB — the result is regenerated on every call.
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
  createRng,
  seedFromString,
  colorToRgba,
  findColor,
} from './cyberia-portal-connector.js';

import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  ENTITY_TYPE_DEFAULTS,
} from '../cyberia-instance-conf/cyberia-instance-conf.defaults.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAP_COUNT = 4;
const DEFAULT_GRID_SIZE = 64;
const DEFAULT_FLOOR_TILE_DIM = 4;
const DEFAULT_OBSTACLE_COUNT = 6;
const DEFAULT_FOREGROUND_COUNT = 3;
const DEFAULT_BOT_COUNT = 4;
const DEFAULT_BOT_DIM = 2;

// ── Floor generator ──────────────────────────────────────────────────────────

/**
 * Generate floor tiles that cover the entire map grid.
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
 * Generate a portal entity at a random position within the map grid.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {() => number} rng  Seeded PRNG.
 * @returns {object}
 */
function generatePortalEntity(mapDims, colors, rng) {
  const portalColor = findColor(colors, 'PORTAL');
  const rgba = portalColor ? colorToRgba(portalColor) : 'rgba(0, 200, 200, 1)';
  const dimX = 2;
  const dimY = 2;
  const maxX = Math.max(0, mapDims.gridX - dimX);
  const maxY = Math.max(0, mapDims.gridY - dimY);
  return {
    entityType: 'portal',
    initCellX: Math.floor(rng() * (maxX + 1)),
    initCellY: Math.floor(rng() * (maxY + 1)),
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
 * - All bots use the `purple` skin item ID.
 * - Roughly half carry the `atlas_pistol_mk2` weapon for variation.
 * - Random positions within grid bounds.
 * - Uses the BOT palette color as fallback.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {() => number} rng  Seeded PRNG.
 * @param {object} [opts]
 * @param {number} [opts.count=4]
 * @param {number} [opts.dim=2]        Bot dimension in cells.
 * @param {number} [opts.spawnRadius=5]
 * @param {number} [opts.aggroRange=10]
 * @param {number} [opts.maxLife=100]
 * @returns {object[]}
 */
function generateBots(mapDims, colors, rng, opts = {}) {
  const { count = DEFAULT_BOT_COUNT, dim = DEFAULT_BOT_DIM, spawnRadius = 5, aggroRange = 10, maxLife = 100 } = opts;
  const botColor = findColor(colors, 'BOT');
  const rgba = botColor ? colorToRgba(botColor) : 'rgba(255, 128, 0, 1)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const maxX = Math.max(0, mapDims.gridX - dim);
    const maxY = Math.max(0, mapDims.gridY - dim);

    // Alternate: roughly half get a weapon, half don't.
    const hasWeapon = rng() < 0.5;
    const itemIds = hasWeapon ? ['purple', 'atlas_pistol_mk2'] : ['purple'];

    entities.push({
      entityType: 'bot',
      initCellX: Math.floor(rng() * (maxX + 1)),
      initCellY: Math.floor(rng() * (maxY + 1)),
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
 *
 * @param {string} mapCode
 * @param {string} seed              Deterministic seed string.
 * @param {Array} colors             Palette from CYBERIA_INSTANCE_CONF_DEFAULTS.
 * @param {object} [opts]
 * @param {number} [opts.gridSize]
 * @param {number} [opts.obstacleCount]
 * @param {number} [opts.foregroundCount]
 * @param {number} [opts.botCount]
 * @returns {object}  CyberiaMap-shaped plain object.
 */
function generateFallbackMap(mapCode, seed, colors, opts = {}) {
  const gridSize = opts.gridSize || DEFAULT_GRID_SIZE;
  const mapDims = { gridX: gridSize, gridY: gridSize };
  const mapSeed = `${seed}:${mapCode}`;
  const rng = createRng(seedFromString(mapSeed));

  const entities = [
    // Floor — full coverage
    ...generateFloorEntities(mapDims, colors),
    // Portal — one per map for topology linking
    generatePortalEntity(mapDims, colors, rng),
    // Obstacles — solid-color collision blocks
    ...generateObstacles(mapDims, colors, {
      count: opts.obstacleCount ?? DEFAULT_OBSTACLE_COUNT,
      seed: mapSeed + ':obstacles',
    }),
    // Foreground — semi-transparent overlays
    ...generateForeground(mapDims, colors, {
      count: opts.foregroundCount ?? DEFAULT_FOREGROUND_COUNT,
      seed: mapSeed + ':foreground',
    }),
    // Bots — purple skin, optional weapon
    ...generateBots(mapDims, colors, rng, {
      count: opts.botCount ?? DEFAULT_BOT_COUNT,
    }),
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
 * @param {string} [opts.seed='fallback']     Seed for deterministic generation.
 * @param {number} [opts.mapCount=4]          Number of maps to generate.
 * @param {number} [opts.gridSize=64]         Grid size per map.
 * @param {number} [opts.obstacleCount]       Obstacles per map.
 * @param {number} [opts.foregroundCount]     Foreground entities per map.
 * @param {number} [opts.botCount]            Bots per map.
 * @param {Array}  [opts.colors]              Override palette (defaults to CYBERIA_INSTANCE_CONF_DEFAULTS.colors).
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
    seed = 'fallback',
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

  // Generate each map.
  const maps = mapCodes.map((code) =>
    generateFallbackMap(code, seed, colors, {
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
    seed,
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
