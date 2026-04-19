/**
 * Procedural World Generator — pure-function module.
 *
 * Centralises every procedural entity generator used by the Cyberia Online
 * engine (obstacles, foreground, resources, floors, portals, bots) together
 * with the shared helpers they need (colour conversion, random numbers,
 * occupancy-grid placement).
 *
 * Consumers:
 *   - cyberia-fallback-world.js  (full fallback world)
 *   - cyberia-portal-connector.js  (no generators — uses colour/random helpers only)
 *   - cyberia-instance.service.js  (optional entity back-fill in portalConnect endpoint)
 *
 * All exported functions are stateless and synchronous.
 *
 * @module src/api/cyberia-instance/cyberia-world-generator
 */

import {
  ENTITY_TYPE_DEFAULTS,
} from '../cyberia-instance-conf/cyberia-instance-conf.defaults.js';

import { DefaultCyberiaItems } from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

import {
  PORTAL_MODES,
  PORTAL_MODE_COLOR_KEY,
  EXTRA_PORTAL_MODES,
} from './cyberia-portal-connector.js';

// ── Color helpers ────────────────────────────────────────────────────────────

/**
 * Convert a { r, g, b, a } palette entry to an `rgba(…)` CSS string.
 * @param {{ r: number, g: number, b: number, a: number }} c
 * @returns {string}
 */
const colorToRgba = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;

/**
 * Look up a palette entry by key from a colours array.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {string} key
 * @returns {{ r: number, g: number, b: number, a: number } | undefined}
 */
const findColor = (colors, key) => colors.find((c) => c.key === key);

// ── Random helpers ───────────────────────────────────────────────────────────

/**
 * Return a random integer in [min, max] (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ── Entity count ranges ──────────────────────────────────────────────────────
// [min, max] — actual count is random within range on each generation call.

const OBSTACLE_RANGE = [20, 35];
const FOREGROUND_RANGE = [10, 20];
const BOT_RANGE = [8, 16];
const RESOURCE_RANGE = [6, 12];
const BOT_WEAPON_CHANCE = 0.6;
const PORTAL_DIM_RANGE = [2, 3];
const PORTAL_COUNT_RANGE = [2, 4];

// ── Bot defaults ─────────────────────────────────────────────────────────────

const DEFAULT_BOT_DIM_RANGE = [2, 3];
const DEFAULT_FLOOR_TILE_DIM = 4;

/** NPC skin pool — all items with type 'skin' from DefaultCyberiaItems. */
const BOT_SKIN_POOL = DefaultCyberiaItems.filter((e) => e.item.type === 'skin').map((e) => e.item.id);

// ── Occupancy grid ───────────────────────────────────────────────────────────

/**
 * 2D boolean grid that tracks which cells are blocked (obstacle / placed entity).
 * Used to find valid walkable positions when placing portals and bots.
 */
class OccupancyGrid {
  /**
   * @param {number} width  Grid columns.
   * @param {number} height Grid rows.
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // false = walkable, true = blocked
    this.cells = Array.from({ length: height }, () => new Array(width).fill(false));
  }

  /**
   * Mark a rectangular region as blocked.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  block(x, y, w, h) {
    for (let row = y; row < y + h && row < this.height; row++) {
      for (let col = x; col < x + w && col < this.width; col++) {
        if (row >= 0 && col >= 0) this.cells[row][col] = true;
      }
    }
  }

  /**
   * Check whether a rectangle fits entirely within walkable (unblocked) cells.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @returns {boolean}
   */
  fits(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        if (this.cells[row][col]) return false;
      }
    }
    return true;
  }

  /**
   * Find a random walkable position for a rectangle of given dimensions.
   * Tries up to `maxAttempts` random positions before giving up.
   * @param {number} w
   * @param {number} h
   * @param {number} [maxAttempts=200]
   * @returns {{ x: number, y: number } | null}  Position or null if no fit found.
   */
  findPosition(w, h, maxAttempts = 200) {
    const maxX = Math.max(0, this.width - w);
    const maxY = Math.max(0, this.height - h);
    for (let i = 0; i < maxAttempts; i++) {
      const x = randInt(0, maxX);
      const y = randInt(0, maxY);
      if (this.fits(x, y, w, h)) return { x, y };
    }
    return null;
  }

  /**
   * Populate the grid from an array of obstacle entities.
   * @param {Array<{ initCellX: number, initCellY: number, dimX: number, dimY: number }>} obstacles
   */
  addObstacles(obstacles) {
    for (const o of obstacles) {
      this.block(o.initCellX, o.initCellY, o.dimX, o.dimY);
    }
  }
}

// ── Procedural entity generators ─────────────────────────────────────────────

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

/**
 * Generate procedural obstacle entities for a map.
 *
 * @param {{ gridX: number, gridY: number }} mapDims  Map grid dimensions.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors  Palette.
 * @param {object} [opts]
 * @param {number} [opts.count]         Override count (ignores range).
 * @param {number} [opts.minDim=1]      Minimum obstacle width/height (cells).
 * @param {number} [opts.maxDim=4]      Maximum obstacle width/height (cells).
 * @returns {object[]}  Array of CyberiaEntity plain objects.
 */
function generateObstacles(mapDims, colors, opts = {}) {
  const { minDim = 1, maxDim = 4 } = opts;
  const count = opts.count ?? randInt(OBSTACLE_RANGE[0], OBSTACLE_RANGE[1]);
  const { gridX, gridY } = mapDims;

  const obstacleColor = findColor(colors, 'OBSTACLE');
  const rgba = obstacleColor ? colorToRgba(obstacleColor) : 'rgba(80, 80, 80, 1)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const dimX = randInt(minDim, maxDim);
    const dimY = randInt(minDim, maxDim);
    const maxX = Math.max(0, gridX - dimX);
    const maxY = Math.max(0, gridY - dimY);
    entities.push({
      entityType: 'obstacle',
      initCellX: randInt(0, maxX),
      initCellY: randInt(0, maxY),
      dimX,
      dimY,
      color: rgba,
      objectLayerItemIds: [],
    });
  }
  return entities;
}

/**
 * Generate procedural foreground entities for a map.
 *
 * @param {{ gridX: number, gridY: number }} mapDims  Map grid dimensions.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors  Palette.
 * @param {object} [opts]
 * @param {number} [opts.count]         Override count (ignores range).
 * @param {number} [opts.minDim=2]      Minimum foreground width/height (cells).
 * @param {number} [opts.maxDim=6]      Maximum foreground width/height (cells).
 * @returns {object[]}  Array of CyberiaEntity plain objects.
 */
function generateForeground(mapDims, colors, opts = {}) {
  const { minDim = 2, maxDim = 6 } = opts;
  const count = opts.count ?? randInt(FOREGROUND_RANGE[0], FOREGROUND_RANGE[1]);
  const { gridX, gridY } = mapDims;

  const fgColor = findColor(colors, 'FOREGROUND');
  const rgba = fgColor ? colorToRgba(fgColor) : 'rgba(200, 200, 200, 0.31)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const dimX = randInt(minDim, maxDim);
    const dimY = randInt(minDim, maxDim);
    const maxX = Math.max(0, gridX - dimX);
    const maxY = Math.max(0, gridY - dimY);
    entities.push({
      entityType: 'foreground',
      initCellX: randInt(0, maxX),
      initCellY: randInt(0, maxY),
      dimX,
      dimY,
      color: rgba,
      objectLayerItemIds: [],
    });
  }
  return entities;
}

/**
 * Generate procedural resource entities for a map.
 *
 * Resources are static, exploitable entities (wood, minerals, etc.).
 * They use the RESOURCE palette colour as fallback and are placed
 * on walkable cells via the occupancy grid when provided.
 *
 * @param {{ gridX: number, gridY: number }} mapDims  Map grid dimensions.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors  Palette.
 * @param {object} [opts]
 * @param {number} [opts.count]         Override count (ignores range).
 * @param {number} [opts.dim=2]         Resource width/height (cells).
 * @param {number} [opts.maxLife=80]     Hit-points before destruction.
 * @param {string[]} [opts.itemIds]     Object layer item IDs (default: ['wood']).
 * @param {OccupancyGrid} [opts.grid]   If provided, places resources only on walkable cells.
 * @returns {object[]}  Array of CyberiaEntity plain objects.
 */
function generateResources(mapDims, colors, opts = {}) {
  const { dim = 2, maxLife = 80 } = opts;
  const count = opts.count ?? randInt(RESOURCE_RANGE[0], RESOURCE_RANGE[1]);
  const itemIds = opts.itemIds ?? ['wood'];
  const resColor = findColor(colors, 'RESOURCE');
  const rgba = resColor ? colorToRgba(resColor) : 'rgba(100, 180, 80, 1)';

  const entities = [];
  for (let i = 0; i < count; i++) {
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

    entities.push({
      entityType: 'resource',
      initCellX: cellX,
      initCellY: cellY,
      dimX: dim,
      dimY: dim,
      color: rgba,
      objectLayerItemIds: [...itemIds],
      maxLife,
    });
  }
  return entities;
}

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

/**
 * Generate bot entities for a map.
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

/**
 * Generate all procedural fallback entities (obstacles + foreground + resources) for a map.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {object} [opts]
 * @param {number} [opts.obstacleCount]
 * @param {number} [opts.foregroundCount]
 * @param {number} [opts.resourceCount]
 * @param {OccupancyGrid} [opts.grid]
 * @returns {{ obstacles: object[], foreground: object[], resources: object[] }}
 */
function generateProceduralEntities(mapDims, colors, opts = {}) {
  return {
    obstacles: generateObstacles(mapDims, colors, { count: opts.obstacleCount }),
    foreground: generateForeground(mapDims, colors, { count: opts.foregroundCount }),
    resources: generateResources(mapDims, colors, { count: opts.resourceCount, grid: opts.grid }),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export {
  // Helpers
  colorToRgba,
  findColor,
  randInt,
  // Placement
  OccupancyGrid,
  // Generators
  generateFloorEntities,
  generateObstacles,
  generateForeground,
  generateResources,
  generatePortalEntity,
  generatePortalEntities,
  generateBots,
  generateProceduralEntities,
  // Ranges
  OBSTACLE_RANGE,
  FOREGROUND_RANGE,
  BOT_RANGE,
  RESOURCE_RANGE,
  BOT_WEAPON_CHANCE,
  PORTAL_DIM_RANGE,
  PORTAL_COUNT_RANGE,
};
