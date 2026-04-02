/**
 * Central Portal Connector — pure-function module.
 *
 * Shared by the backend (CyberiaInstanceService) and the GUI (map editor)
 * to build, validate, and procedurally generate portal topology and world
 * entities for a CyberiaInstance.
 *
 * All exported functions are stateless and synchronous — they operate on
 * plain JS objects (lean Mongoose docs or JSON from the API) so the GUI
 * can call them directly without a DB dependency.
 *
 * @module src/api/cyberia-instance/cyberia-portal-connector
 */

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

// ── Portal topology builders ─────────────────────────────────────────────────

/**
 * Canonical portal mode strings.
 * @enum {string}
 */
const PORTAL_MODES = Object.freeze({
  INTER_PORTAL: 'inter-portal', // teleport to a portal on another map
  INTER_RANDOM: 'inter-random', // teleport to a random spot on another map
  INTRA_RANDOM: 'intra-random', // teleport to a random spot on the same map
  INTRA_PORTAL: 'intra-portal', // teleport to a portal on the same map
});

/**
 * All portal mode values as an array (for random selection).
 * @type {string[]}
 */
const PORTAL_MODE_LIST = Object.values(PORTAL_MODES);

/**
 * Map from portal mode to its palette colour key.
 * @type {Record<string, string>}
 */
const PORTAL_MODE_COLOR_KEY = Object.freeze({
  [PORTAL_MODES.INTER_PORTAL]: 'PORTAL_INTER_PORTAL',
  [PORTAL_MODES.INTER_RANDOM]: 'PORTAL_INTER_RANDOM',
  [PORTAL_MODES.INTRA_RANDOM]: 'PORTAL_INTRA_RANDOM',
  [PORTAL_MODES.INTRA_PORTAL]: 'PORTAL_INTRA_PORTAL',
});

/**
 * Portal modes available for extra (non-ring) portals.
 * The ring always uses INTER_PORTAL; extras are randomly chosen from these.
 * @type {string[]}
 */
const EXTRA_PORTAL_MODES = [PORTAL_MODES.INTRA_PORTAL, PORTAL_MODES.INTRA_RANDOM, PORTAL_MODES.INTER_RANDOM];

/**
 * Extract all portal-type entities from each map document and build
 * a lookup: `{ [mapCode]: portalEntity[] }`.
 *
 * @param {Array<{ code: string, entities: Array<{ entityType: string, portalSubtype?: string, initCellX: number, initCellY: number }> }>} maps
 * @returns {Record<string, object[]>}
 */
function indexPortalEntities(maps) {
  const idx = {};
  for (const map of maps) {
    idx[map.code] = (map.entities || []).filter((e) => e.entityType === 'portal');
  }
  return idx;
}

/**
 * Build portal edges from a set of maps with portal entities.
 *
 * Phase 1 — **Ring guarantee**: creates an inter-portal ring that
 * connects every map in a circle (0→1→2→…→n-1→0) so that every map
 * is reachable from every other map.  One portal entity per map is
 * consumed for the ring.
 *
 * Phase 2 — **Extra edges**: remaining portal entities (those not used
 * in the ring) produce edges according to their `portalSubtype`:
 *   inter-portal  → portal on a DIFFERENT map
 *   inter-random  → random pos on a DIFFERENT map
 *   intra-random  → random pos on the SAME map
 *   intra-portal  → portal on the SAME map
 *
 * @param {string[]} orderedCodes  Map codes in instance order.
 * @param {Record<string, object[]>} portalIndex  From `indexPortalEntities`.
 * @returns {{ portals: object[], topology: string }}
 */
function buildTopologyFromSubtypes(orderedCodes, portalIndex) {
  const n = orderedCodes.length;
  if (n < 1) return { portals: [], topology: 'none' };

  const portals = [];
  const usedInRing = new Set();

  // ── Phase 1: Guaranteed inter-portal ring ───────────────────────────
  // Each map links to the next in a circle: 0→1→2→…→(n-1)→0.
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      const srcCode = orderedCodes[i];
      const tgtCode = orderedCodes[(i + 1) % n];

      // Prefer an unused inter-portal entity as source; fall back to any unused, then any
      const srcAll = portalIndex[srcCode] || [];
      const srcInterUnused = srcAll.filter(
        (e) => (e.portalSubtype || PORTAL_MODES.INTER_PORTAL) === PORTAL_MODES.INTER_PORTAL && !usedInRing.has(e),
      );
      const srcAnyUnused = srcAll.filter((e) => !usedInRing.has(e));
      const srcEnt = srcInterUnused[0] || srcAnyUnused[0] || srcAll[0];

      // Target: pick any portal on the target map for landing coordinates
      const tgtAll = portalIndex[tgtCode] || [];
      const tgtEnt = tgtAll.length > 0 ? tgtAll[Math.floor(Math.random() * tgtAll.length)] : null;

      if (srcEnt) {
        usedInRing.add(srcEnt);
        portals.push({
          sourceMapCode: srcCode,
          sourceCellX: srcEnt.initCellX ?? 0,
          sourceCellY: srcEnt.initCellY ?? 0,
          targetMapCode: tgtCode,
          targetCellX: tgtEnt?.initCellX ?? 0,
          targetCellY: tgtEnt?.initCellY ?? 0,
          portalMode: PORTAL_MODES.INTER_PORTAL,
        });
      }
    }
  }

  // ── Phase 2: Extra edges from remaining portals ─────────────────────
  const otherMap = (srcCode) => {
    if (n < 2) return srcCode;
    let code;
    do {
      code = orderedCodes[Math.floor(Math.random() * n)];
    } while (code === srcCode && n > 1);
    return code;
  };

  for (const srcCode of orderedCodes) {
    const allOnMap = portalIndex[srcCode] || [];
    const remaining = allOnMap.filter((e) => !usedInRing.has(e));

    for (const srcEnt of remaining) {
      const sub = srcEnt.portalSubtype || PORTAL_MODES.INTER_PORTAL;

      switch (sub) {
        case PORTAL_MODES.INTER_PORTAL: {
          const tgtCode = otherMap(srcCode);
          const candidates = portalIndex[tgtCode] || [];
          const tgtEnt = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
          portals.push({
            sourceMapCode: srcCode,
            sourceCellX: srcEnt.initCellX ?? 0,
            sourceCellY: srcEnt.initCellY ?? 0,
            targetMapCode: tgtCode,
            targetCellX: tgtEnt?.initCellX ?? 0,
            targetCellY: tgtEnt?.initCellY ?? 0,
            portalMode: PORTAL_MODES.INTER_PORTAL,
          });
          break;
        }
        case PORTAL_MODES.INTER_RANDOM: {
          const tgtCode = otherMap(srcCode);
          portals.push({
            sourceMapCode: srcCode,
            sourceCellX: srcEnt.initCellX ?? 0,
            sourceCellY: srcEnt.initCellY ?? 0,
            targetMapCode: tgtCode,
            targetCellX: -1,
            targetCellY: -1,
            portalMode: PORTAL_MODES.INTER_RANDOM,
          });
          break;
        }
        case PORTAL_MODES.INTRA_RANDOM: {
          portals.push({
            sourceMapCode: srcCode,
            sourceCellX: srcEnt.initCellX ?? 0,
            sourceCellY: srcEnt.initCellY ?? 0,
            targetMapCode: srcCode,
            targetCellX: -1,
            targetCellY: -1,
            portalMode: PORTAL_MODES.INTRA_RANDOM,
          });
          break;
        }
        case PORTAL_MODES.INTRA_PORTAL: {
          const candidates = allOnMap.filter(
            (e) => e !== srcEnt && (e.initCellX !== srcEnt.initCellX || e.initCellY !== srcEnt.initCellY),
          );
          const tgtEnt = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
          portals.push({
            sourceMapCode: srcCode,
            sourceCellX: srcEnt.initCellX ?? 0,
            sourceCellY: srcEnt.initCellY ?? 0,
            targetMapCode: srcCode,
            targetCellX: tgtEnt?.initCellX ?? 0,
            targetCellY: tgtEnt?.initCellY ?? 0,
            portalMode: PORTAL_MODES.INTRA_PORTAL,
          });
          break;
        }
      }
    }
  }

  return { portals, topology: n === 1 ? 'intra-only' : 'ring+mixed' };
}

/**
 * Central portal-connect pipeline.
 *
 * Given an instance's ordered map codes and the full map documents (with
 * entities), returns the auto-generated portal edge list.
 *
 * @param {string[]} mapCodes       Instance's `cyberiaMapCodes` array.
 * @param {Array<{ code: string, entities: object[] }>} maps  Map documents (lean or JSON).
 * @returns {{ portals: object[], topology: string, mapCount: number }}
 */
function connectPortals(mapCodes, maps) {
  if (!mapCodes || mapCodes.length < 1) {
    return { portals: [], topology: 'none', mapCount: mapCodes?.length ?? 0, message: 'Need at least 1 map.' };
  }

  const portalIndex = indexPortalEntities(maps);

  // Filter to codes that actually exist in the fetched maps.
  const knownCodes = new Set(maps.map((m) => m.code));
  const ordered = mapCodes.filter((c) => knownCodes.has(c));
  if (ordered.length < 1) {
    return { portals: [], topology: 'none', mapCount: ordered.length, message: 'Need at least 1 map.' };
  }

  const { portals, topology } = buildTopologyFromSubtypes(ordered, portalIndex);
  return { portals, topology, mapCount: ordered.length };
}

// ── Procedural entity generators ─────────────────────────────────────────────

/**
 * Generate procedural obstacle entities for a map.
 *
 * Obstacles use empty `objectLayerItemIds` so they render as a solid colour
 * from the OBSTACLE palette entry.  Count, dimensions, and positions are
 * all fully random within the declared ranges.
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
 * Foregrounds use empty `objectLayerItemIds` and a semi-transparent colour
 * from the FOREGROUND palette entry.  Count, dimensions, and positions are
 * all fully random within the declared ranges.
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
 * Generate all procedural fallback entities (obstacles + foreground) for a map.
 *
 * @param {{ gridX: number, gridY: number }} mapDims
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors
 * @param {object} [opts]
 * @param {number} [opts.obstacleCount]
 * @param {number} [opts.foregroundCount]
 * @returns {{ obstacles: object[], foreground: object[] }}
 */
function generateProceduralEntities(mapDims, colors, opts = {}) {
  return {
    obstacles: generateObstacles(mapDims, colors, { count: opts.obstacleCount }),
    foreground: generateForeground(mapDims, colors, { count: opts.foregroundCount }),
  };
}

// ── Entity count ranges ──────────────────────────────────────────────────────
// [min, max] — actual count is random within range on each generation call.

const OBSTACLE_RANGE = [20, 35];
const FOREGROUND_RANGE = [10, 20];
const BOT_RANGE = [8, 16];
const BOT_WEAPON_CHANCE = 0.6;
const PORTAL_DIM_RANGE = [2, 3];
const PORTAL_COUNT_RANGE = [2, 4];

// ── Public API ───────────────────────────────────────────────────────────────

export {
  // Portal topology
  connectPortals,
  buildTopologyFromSubtypes,
  indexPortalEntities,
  // Portal modes
  PORTAL_MODES,
  PORTAL_MODE_LIST,
  PORTAL_MODE_COLOR_KEY,
  EXTRA_PORTAL_MODES,
  // Procedural entities
  generateObstacles,
  generateForeground,
  generateProceduralEntities,
  // Placement
  OccupancyGrid,
  // Helpers
  colorToRgba,
  findColor,
  randInt,
  // Ranges
  OBSTACLE_RANGE,
  FOREGROUND_RANGE,
  BOT_RANGE,
  BOT_WEAPON_CHANCE,
  PORTAL_DIM_RANGE,
  PORTAL_COUNT_RANGE,
};
