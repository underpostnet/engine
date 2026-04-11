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
  OccupancyGrid,
  BOT_RANGE,
  BOT_WEAPON_CHANCE,
  PORTAL_DIM_RANGE,
  PORTAL_COUNT_RANGE,
  PORTAL_MODE_LIST,
  PORTAL_MODE_COLOR_KEY,
  EXTRA_PORTAL_MODES,
  PORTAL_MODES,
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

/**
 * NPC skin pool used by the bot generator.  Each bot picks a random skin
 * instead of always spawning as `purple`, giving the fallback world visual
 * variety and ensuring dialogue bubbles appear for different characters.
 */
const BOT_SKIN_POOL = [
  'purple',
  'wason',
  'scp-2040',
  'punk',
  'lain',
  'kaneki',
  'junko',
  'eiri',
  'anon',
  'alex',
  'agent',
];

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
 * Generate a portal entity at a random walkable position with random dimensions.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {OccupancyGrid} [grid]  If provided, places portal only on walkable cells and marks them blocked.
 * @param {string} [portalSubtype]  One of PORTAL_MODE_LIST values. Determines the portal colour.
 * @returns {object|null}  Portal entity or null if no valid position found.
 */
function generatePortalEntity(mapDims, colors, grid, portalSubtype) {
  // Resolve colour from subtype-specific palette key, falling back to generic PORTAL
  const colorKey = portalSubtype ? PORTAL_MODE_COLOR_KEY[portalSubtype] : 'PORTAL';
  const portalColor = findColor(colors, colorKey) || findColor(colors, 'PORTAL');
  const rgba = portalColor ? colorToRgba(portalColor) : 'rgba(0, 200, 200, 1)';
  const dimX = randInt(PORTAL_DIM_RANGE[0], PORTAL_DIM_RANGE[1]);
  const dimY = randInt(PORTAL_DIM_RANGE[0], PORTAL_DIM_RANGE[1]);

  if (grid) {
    const pos = grid.findPosition(dimX, dimY);
    if (!pos) return null;
    grid.block(pos.x, pos.y, dimX, dimY);
    return {
      entityType: 'portal',
      portalSubtype: portalSubtype || 'inter-portal',
      initCellX: pos.x,
      initCellY: pos.y,
      dimX,
      dimY,
      color: rgba,
      objectLayerItemIds: [],
    };
  }

  const maxX = Math.max(0, mapDims.gridX - dimX);
  const maxY = Math.max(0, mapDims.gridY - dimY);
  return {
    entityType: 'portal',
    portalSubtype: portalSubtype || 'inter-portal',
    initCellX: randInt(0, maxX),
    initCellY: randInt(0, maxY),
    dimX,
    dimY,
    color: rgba,
    objectLayerItemIds: [],
  };
}

/**
 * Generate a random number of portal entities for a map, each with a
 * randomly assigned portal subtype (and corresponding colour).
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {object} [opts]
 * @param {number} [opts.count]  Override count (ignores range).
 * @param {OccupancyGrid} [opts.grid]  If provided, places portals only on walkable cells.
 * @returns {object[]}
 */
function generatePortalEntities(mapDims, colors, opts = {}) {
  const count = opts.count ?? randInt(PORTAL_COUNT_RANGE[0], PORTAL_COUNT_RANGE[1]);
  const entities = [];
  for (let i = 0; i < count; i++) {
    // First portal is always inter-portal (reserved for the ring topology);
    // extra portals get a random non-ring subtype.
    const subtype =
      i === 0 ? PORTAL_MODES.INTER_PORTAL : EXTRA_PORTAL_MODES[Math.floor(Math.random() * EXTRA_PORTAL_MODES.length)];
    const portal = generatePortalEntity(mapDims, colors, opts.grid, subtype);
    if (portal) entities.push(portal);
  }
  return entities;
}

// ── Bot generator ────────────────────────────────────────────────────────────

/**
 * Generate bot entities for a map.
 *
 * - Each bot picks a random skin from BOT_SKIN_POOL for visual variety.
 * - Random chance to also carry `atlas_pistol_mk2` weapon.
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
 * @param {OccupancyGrid} [opts.grid]  If provided, places bots only on walkable cells.
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

    let cellX, cellY;
    if (opts.grid) {
      const pos = opts.grid.findPosition(dim, dim);
      if (!pos) continue;
      opts.grid.block(pos.x, pos.y, dim, dim);
      cellX = pos.x;
      cellY = pos.y;
    } else {
      const maxX = Math.max(0, mapDims.gridX - dim);
      const maxY = Math.max(0, mapDims.gridY - dim);
      cellX = randInt(0, maxX);
      cellY = randInt(0, maxY);
    }

    const skin = BOT_SKIN_POOL[Math.floor(Math.random() * BOT_SKIN_POOL.length)];
    const hasWeapon = Math.random() < BOT_WEAPON_CHANCE;
    const itemIds = hasWeapon ? [skin, 'atlas_pistol_mk2'] : [skin];

    entities.push({
      entityType: 'bot',
      initCellX: cellX,
      initCellY: cellY,
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

  // 1. Floor — deterministic full coverage
  const floors = generateFloorEntities(mapDims, colors);

  // 2. Obstacles — random count, position, dimensions (placed first)
  const obstacles = generateObstacles(mapDims, colors, { count: opts.obstacleCount });

  // 3. Build occupancy grid from obstacles
  const grid = new OccupancyGrid(gridSize, gridSize);
  grid.addObstacles(obstacles);

  // 4. Portals — placed on walkable cells only, then blocked so bots avoid them
  const portalEntities = generatePortalEntities(mapDims, colors, { grid });

  // 5. Bots — placed on walkable cells (avoids obstacles and portals)
  const bots = generateBots(mapDims, colors, { count: opts.botCount, grid });

  // 6. Foreground — decorative, no collision restriction
  const foreground = generateForeground(mapDims, colors, { count: opts.foregroundCount });

  const entities = [...floors, ...obstacles, ...portalEntities, ...foreground, ...bots];

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

export {
  generateFallbackWorld,
  generateFallbackMap,
  generateFloorEntities,
  generatePortalEntity,
  generatePortalEntities,
  generateBots,
};
