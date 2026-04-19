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

import { connectPortals } from './cyberia-portal-connector.js';

import {
  generateObstacles,
  generateForeground,
  generateResources,
  generateFloorEntities,
  generatePortalEntity,
  generatePortalEntities,
  generateBots,
  OccupancyGrid,
} from './cyberia-world-generator.js';

import { CYBERIA_INSTANCE_CONF_DEFAULTS } from '../cyberia-instance-conf/cyberia-instance-conf.defaults.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAP_COUNT = 4;
const DEFAULT_GRID_SIZE = 64;

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
 * @param {number} [opts.resourceCount]
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

  // 6. Resources — static exploitable entities placed on walkable cells
  const resources = generateResources(mapDims, colors, { count: opts.resourceCount, grid });

  // 7. Foreground — decorative, no collision restriction
  const foreground = generateForeground(mapDims, colors, { count: opts.foregroundCount });

  const entities = [...floors, ...obstacles, ...portalEntities, ...foreground, ...bots, ...resources];

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
 * @param {number} [opts.resourceCount]        Resources per map (random if omitted).
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
    resourceCount,
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
      resourceCount,
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
};
