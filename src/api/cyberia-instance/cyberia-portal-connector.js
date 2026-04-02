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

// ── Portal topology builders ─────────────────────────────────────────────────

/**
 * Extract the first portal-type entity from each map document and build
 * a lookup: `{ [mapCode]: portalEntity | null }`.
 *
 * @param {Array<{ code: string, entities: Array<{ entityType: string, initCellX: number, initCellY: number }> }>} maps
 * @returns {Record<string, object | null>}
 */
function indexPortalEntities(maps) {
  const idx = {};
  for (const map of maps) {
    const portal = (map.entities || []).find((e) => e.entityType === 'portal');
    idx[map.code] = portal || null;
  }
  return idx;
}

/**
 * Build a minimal circular-ring (Hamiltonian cycle) portal topology from
 * an ordered list of map codes.
 *
 * - 0–1 maps → no edges.
 * - 2 maps   → bidirectional pair (A→B, B→A).
 * - N ≥ 3    → directed cycle A→B→C→…→A (N edges).
 *
 * Source / target cell coordinates are taken from the first portal entity
 * found on each map (falling back to 0,0).
 *
 * @param {string[]} orderedCodes  Map codes in instance order.
 * @param {Record<string, object|null>} portalIndex  From `indexPortalEntities`.
 * @returns {{ portals: object[], topology: string }}
 */
function buildCircularTopology(orderedCodes, portalIndex) {
  const n = orderedCodes.length;
  if (n < 2) return { portals: [], topology: 'none' };

  const portals = [];
  for (let i = 0; i < n; i++) {
    const srcCode = orderedCodes[i];
    const tgtCode = orderedCodes[(i + 1) % n];
    const srcEnt = portalIndex[srcCode];
    const tgtEnt = portalIndex[tgtCode];
    portals.push({
      sourceMapCode: srcCode,
      sourceCellX: srcEnt?.initCellX ?? 0,
      sourceCellY: srcEnt?.initCellY ?? 0,
      targetMapCode: tgtCode,
      targetCellX: tgtEnt?.initCellX ?? 0,
      targetCellY: tgtEnt?.initCellY ?? 0,
    });
  }

  return { portals, topology: n === 2 ? 'bidirectional' : 'circular' };
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
  if (!mapCodes || mapCodes.length < 2) {
    return { portals: [], topology: 'none', mapCount: mapCodes?.length ?? 0, message: 'Need at least 2 maps.' };
  }

  const portalIndex = indexPortalEntities(maps);

  // Filter to codes that actually exist in the fetched maps.
  const knownCodes = new Set(maps.map((m) => m.code));
  const ordered = mapCodes.filter((c) => knownCodes.has(c));
  if (ordered.length < 2) {
    return { portals: [], topology: 'none', mapCount: ordered.length, message: 'Need at least 2 maps.' };
  }

  const { portals, topology } = buildCircularTopology(ordered, portalIndex);
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

const OBSTACLE_RANGE = [12, 20];
const FOREGROUND_RANGE = [6, 12];
const BOT_RANGE = [8, 16];
const PORTAL_DIM_RANGE = [2, 3];

// ── Public API ───────────────────────────────────────────────────────────────

export {
  // Portal topology
  connectPortals,
  buildCircularTopology,
  indexPortalEntities,
  // Procedural entities
  generateObstacles,
  generateForeground,
  generateProceduralEntities,
  // Helpers
  colorToRgba,
  findColor,
  randInt,
  // Ranges
  OBSTACLE_RANGE,
  FOREGROUND_RANGE,
  BOT_RANGE,
  PORTAL_DIM_RANGE,
};
