/**
 * Central Portal Connector — pure-function module.
 *
 * Sole responsibility: build, validate, and connect portal topology
 * for a CyberiaInstance.  Given map documents with portal entities,
 * produces a minimal ring that guarantees full reachability, then
 * assigns random portal behaviour to every remaining (unconnected)
 * portal.
 *
 * Shared by the backend (CyberiaInstanceService.portalConnect) and the
 * GUI (Instance Engine "Portal Connector" button) so the same logic
 * runs everywhere without a DB dependency.
 *
 * This module does NOT generate procedural entities (obstacles,
 * foreground, resources, bots, etc.).  For that, see
 * cyberia-world-generator.js.
 *
 * All exported functions are stateless and synchronous.
 *
 * @module src/api/cyberia-instance/cyberia-portal-connector
 */

// ── Portal mode constants ────────────────────────────────────────────────────

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

// ── Portal topology builders ─────────────────────────────────────────────────

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
      // If the entity already has an explicit subtype, honour it;
      // otherwise assign a random mode (matching fallback-world behaviour).
      const sub = srcEnt.portalSubtype || PORTAL_MODE_LIST[Math.floor(Math.random() * PORTAL_MODE_LIST.length)];

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
};
