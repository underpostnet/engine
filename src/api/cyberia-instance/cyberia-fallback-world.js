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
  generateStatic,
  generateFloorEntities,
  generatePortalEntity,
  generatePortalEntities,
  generateBots,
  generateActionProviderBots,
  OccupancyGrid,
} from './cyberia-world-generator.js';

import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  ENTITY_TYPE_DEFAULTS,
  RESOURCE_ENTITY_TYPE_DEFAULTS,
  DefaultSkillConfig,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';
import {
  CYBERIA_CLIENT_HINTS_DEFAULTS,
  DefaultCyberiaItems,
  PALETTE,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAP_COUNT = 4;
const DEFAULT_GRID_SIZE = 64;

// ── Asset-id integrity ──────────────────────────────────────────────────────
//
// Every item id that the fallback world can place on a map must also be
// present in DefaultCyberiaItems, otherwise the `import-default-items` seed
// will not create an ObjectLayer for it and the runtime client will fall
// back to a solid-colour rectangle instead of the intended sprite.
//
// auditFallbackItemIds() returns the set of unknown ids encountered in the
// canonical defaults so callers (CLI, test harness, gRPC fallback path)
// can surface drift immediately. Returns an empty array when in sync.

const KNOWN_DEFAULT_ITEM_IDS = new Set(DefaultCyberiaItems.map((e) => e.item.id));

function collectReferencedItemIds() {
  const ids = new Set();
  const push = (id) => {
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  };

  for (const e of ENTITY_TYPE_DEFAULTS) {
    (e.liveItemIds || []).forEach(push);
    (e.deadItemIds || []).forEach(push);
    (e.dropItemIds || []).forEach(push);
    (e.defaultObjectLayers || []).forEach((ol) => push(ol.itemId));
  }
  for (const r of RESOURCE_ENTITY_TYPE_DEFAULTS) {
    (r.liveItemIds || []).forEach(push);
    (r.deadItemIds || []).forEach(push);
    (r.dropItemIds || []).forEach(push);
  }
  // Skill trigger items and the entities they summon must also resolve to an
  // ObjectLayer. Runtime placeholders ('$active_skin', …) are resolved by the
  // server and are intentionally excluded.
  for (const sk of DefaultSkillConfig) {
    push(sk.triggerItemId);
    for (const s of sk.skills || []) {
      if (typeof s.summonedEntityItemId === 'string' && !s.summonedEntityItemId.startsWith('$')) {
        push(s.summonedEntityItemId);
      }
    }
  }
  return ids;
}

/**
 * Audit every item id the fallback world can place against the canonical
 * DefaultCyberiaItems registry.  Returns an array of missing ids; an empty
 * array means the registry is in sync.
 *
 * @returns {string[]}
 */
function auditFallbackItemIds() {
  const referenced = collectReferencedItemIds();
  const missing = [];
  for (const id of referenced) {
    if (!KNOWN_DEFAULT_ITEM_IDS.has(id)) missing.push(id);
  }
  return missing.sort();
}

// ── Single map generator ─────────────────────────────────────────────────────

/** AABB overlap test for two entities in cell space. */
function entitiesOverlap(a, b) {
  return (
    a.initCellX < b.initCellX + b.dimX &&
    a.initCellX + a.dimX > b.initCellX &&
    a.initCellY < b.initCellY + b.dimY &&
    a.initCellY + a.dimY > b.initCellY
  );
}

/**
 * Generate a complete in-memory map with all entity types.
 * Everything except floor tiles is randomized.
 *
 * @param {string} mapCode
 * @param {Array} colors             Palette (PALETTE from SharedDefaultsCyberia).
 * @param {object} [opts]
 * @param {number} [opts.gridSize]
 * @param {number} [opts.obstacleCount]
 * @param {number} [opts.foregroundCount]
 * @param {number} [opts.botCount]
 * @param {number} [opts.resourceCount]
 * @param {number} [opts.staticCount]
 * @returns {object}  CyberiaMap-shaped plain object.
 */
function generateFallbackMap(mapCode, colors, opts = {}) {
  const gridSize = opts.gridSize || DEFAULT_GRID_SIZE;
  const mapDims = { gridX: gridSize, gridY: gridSize };

  // 1. Floor — deterministic full coverage
  const floors = generateFloorEntities(mapDims, colors);

  // 2. Action-provider NPCs — fixed cells from DefaultCyberiaActions. Built
  //    first so their mission cells are guaranteed clear and walkable.
  const actionProviders = generateActionProviderBots(mapCode, colors);

  // 3. Obstacles — random, minus any overlapping an action-provider cell so
  //    the mission NPCs always stand on walkable ground.
  const obstacles = generateObstacles(mapDims, colors, { count: opts.obstacleCount }).filter(
    (o) => !actionProviders.some((ap) => entitiesOverlap(o, ap)),
  );

  // 4. Build occupancy grid from obstacles, then reserve action-provider cells.
  const grid = new OccupancyGrid(gridSize, gridSize);
  grid.addObstacles(obstacles);
  for (const ap of actionProviders) grid.block(ap.initCellX, ap.initCellY, ap.dimX, ap.dimY);

  // 5. Portals — placed on walkable cells only, then blocked so bots avoid them
  const portalEntities = generatePortalEntities(mapDims, colors, { grid });

  // 6. Bots — placed on walkable cells (avoids obstacles, portals, NPCs)
  const bots = generateBots(mapDims, colors, { count: opts.botCount, grid });

  // 7. Resources — static exploitable entities placed on walkable cells
  const resources = generateResources(mapDims, colors, { count: opts.resourceCount, grid });

  // 8. Foreground — decorative, no collision restriction
  const foreground = generateForeground(mapDims, colors, { count: opts.foregroundCount });

  // 9. Statics — non-moving, passable decorators; depth-sorted with entities.
  const statics = generateStatic(mapDims, colors, { count: opts.staticCount });

  const entities = [
    ...floors,
    ...obstacles,
    ...portalEntities,
    ...foreground,
    ...actionProviders,
    ...bots,
    ...resources,
    ...statics,
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
 * @param {number} [opts.resourceCount]        Resources per map (random if omitted).
 * @param {number} [opts.staticCount]          Static decorators per map (random if omitted).
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
    staticCount,
    // Palette lives in SharedDefaultsCyberia (presentation-owned). The
    // world generator only uses it to stamp a cosmetic rgba(...) string on
    // entities so the browser editor / preview can render a coloured
    // fallback before atlases load. The C client resolves real colours
    // through domain/presentation_runtime — it does not read this value.
    colors = PALETTE,
  } = opts;

  // Surface item-id drift loudly on the very first build, so a missing
  // `bin/cyberia run-workflow import-default-items` run shows up at startup
  // instead of as silent grey rectangles later.
  const missing = auditFallbackItemIds();
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[cyberia-fallback-world] item ids referenced by defaults but absent from DefaultCyberiaItems:',
      missing.join(', '),
      '— run `node bin/cyberia run-workflow import-default-items` after adding them.',
    );
  }

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
      staticCount,
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
    presentationHints: CYBERIA_CLIENT_HINTS_DEFAULTS,
    _fallback: true,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export { generateFallbackWorld, generateFallbackMap, auditFallbackItemIds };
