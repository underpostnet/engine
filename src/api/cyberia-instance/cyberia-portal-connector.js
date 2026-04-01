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

// ── Seeded PRNG ──────────────────────────────────────────────────────────────
// Simple mulberry32 — deterministic for a given numeric seed so procedural
// generation is reproducible when the instance carries a seed string.

/**
 * Create a seeded PRNG (mulberry32).
 * @param {number} seed
 * @returns {() => number} Returns values in [0, 1).
 */
function createRng(seed) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a numeric seed from a string (djb2 hash).
 * Falls back to Date.now() if the string is empty/undefined.
 * @param {string} [seedStr]
 * @returns {number}
 */
function seedFromString(seedStr) {
  if (!seedStr) return Date.now();
  let h = 5381;
  for (let i = 0; i < seedStr.length; i++) h = ((h << 5) + h + seedStr.charCodeAt(i)) | 0;
  return h >>> 0;
}

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
 * from the OBSTACLE palette entry.
 *
 * @param {{ gridX: number, gridY: number }} mapDims  Map grid dimensions.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors  Palette.
 * @param {object} [opts]
 * @param {number} [opts.count=5]       Number of obstacle entities to generate.
 * @param {number} [opts.minDim=1]      Minimum obstacle width/height (cells).
 * @param {number} [opts.maxDim=3]      Maximum obstacle width/height (cells).
 * @param {string} [opts.seed]          Seed string for deterministic output.
 * @returns {object[]}  Array of CyberiaEntity plain objects.
 */
function generateObstacles(mapDims, colors, opts = {}) {
  const { count = 5, minDim = 1, maxDim = 3, seed } = opts;
  const rng = createRng(seedFromString(seed));
  const { gridX, gridY } = mapDims;

  const obstacleColor = findColor(colors, 'OBSTACLE');
  const rgba = obstacleColor ? colorToRgba(obstacleColor) : 'rgba(80, 80, 80, 1)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const dimX = minDim + Math.floor(rng() * (maxDim - minDim + 1));
    const dimY = minDim + Math.floor(rng() * (maxDim - minDim + 1));
    // Keep entity fully inside the grid bounds.
    const maxX = Math.max(0, gridX - dimX);
    const maxY = Math.max(0, gridY - dimY);
    entities.push({
      entityType: 'obstacle',
      initCellX: Math.floor(rng() * (maxX + 1)),
      initCellY: Math.floor(rng() * (maxY + 1)),
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
 * from the FOREGROUND palette entry.
 *
 * @param {{ gridX: number, gridY: number }} mapDims  Map grid dimensions.
 * @param {Array<{ key: string, r: number, g: number, b: number, a: number }>} colors  Palette.
 * @param {object} [opts]
 * @param {number} [opts.count=3]       Number of foreground entities.
 * @param {number} [opts.minDim=2]      Minimum foreground width/height (cells).
 * @param {number} [opts.maxDim=5]      Maximum foreground width/height (cells).
 * @param {string} [opts.seed]          Seed string for deterministic output.
 * @returns {object[]}  Array of CyberiaEntity plain objects.
 */
function generateForeground(mapDims, colors, opts = {}) {
  const { count = 3, minDim = 2, maxDim = 5, seed } = opts;
  const rng = createRng(seedFromString(seed));
  const { gridX, gridY } = mapDims;

  const fgColor = findColor(colors, 'FOREGROUND');
  // Foreground is semi-transparent: keep palette alpha (default 80/255 ≈ 0.31).
  const rgba = fgColor ? colorToRgba(fgColor) : 'rgba(200, 200, 200, 0.31)';

  const entities = [];
  for (let i = 0; i < count; i++) {
    const dimX = minDim + Math.floor(rng() * (maxDim - minDim + 1));
    const dimY = minDim + Math.floor(rng() * (maxDim - minDim + 1));
    const maxX = Math.max(0, gridX - dimX);
    const maxY = Math.max(0, gridY - dimY);
    entities.push({
      entityType: 'foreground',
      initCellX: Math.floor(rng() * (maxX + 1)),
      initCellY: Math.floor(rng() * (maxY + 1)),
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
 * @param {string} [opts.seed]
 * @returns {{ obstacles: object[], foreground: object[] }}
 */
function generateProceduralEntities(mapDims, colors, opts = {}) {
  const baseSeed = opts.seed || '';
  return {
    obstacles: generateObstacles(mapDims, colors, {
      count: opts.obstacleCount,
      seed: baseSeed ? baseSeed + ':obstacles' : undefined,
    }),
    foreground: generateForeground(mapDims, colors, {
      count: opts.foregroundCount,
      seed: baseSeed ? baseSeed + ':foreground' : undefined,
    }),
  };
}

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
  createRng,
  seedFromString,
};
