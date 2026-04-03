/**
 * Canonical default values and type definitions for a CyberiaInstanceConf document.
 *
 * Single source of truth used by:
 *   - cyberia-instance-conf.model.js  — Mongoose schema `default:` declarations
 *   - grpc-server.js                  — FALLBACK_CONFIG_DEFAULTS for missing instances
 *   - bin/cyberia.js                  — imports ITEM_TYPES for asset type enumeration
 *
 * @module src/api/cyberia-instance-conf/cyberia-instance-conf.defaults.js
 */

// ── Item type registry ───────────────────────────────────────────────────────
/**
 * Canonical set of ObjectLayer item type names, used as asset directory names
 * and as the `data.item.type` discriminator on ObjectLayer documents.
 *
 * Values intentionally equal their keys — the object is an enum of valid
 * strings, NOT an integer→z-index map.  Render layer ordering (z-order) is
 * determined separately by `get_priority_for_type()` in entity_render.c.
 *
 * @constant
 * @type {Readonly<{floor:string, skin:string, breastplate:string, weapon:string, skill:string, coin:string}>}
 */
export const ITEM_TYPES = Object.freeze({
  floor: 'floor',
  skin: 'skin',
  breastplate: 'breastplate',
  weapon: 'weapon',
  skill: 'skill',
  coin: 'coin',
});

// ── Entity type defaults ─────────────────────────────────────────────────────
/**
 * Per-entity-type rendering defaults.
 *
 * Each entry defines the canonical visual configuration for ONE entity type:
 *
 *   entityType  — string used by the Go server and C client to identify the
 *                 entity category (matches entity_type_str in game_render.c
 *                 and Behavior for bot sub-types).
 *   liveItemIds — Array of ObjectLayer item IDs applied when the entity is
 *                 alive/active and no explicit items are assigned.  Empty array =
 *                 no OL fallback, rely on colorKey solid fill.
 *   deadItemIds — Array of ObjectLayer item IDs for the dead / ghost / respawning
 *                 state.  Empty array = no dead-state OL; same solid fill as live.
 *                 Replaces the old flat ghostItemId field for players.
 *   colorKey    — Named palette colour key (see colors in CYBERIA_INSTANCE_CONF_DEFAULTS).
 *                 Used as solid-colour fallback when the entity carries NO active
 *                 ObjectLayer items, or while atlas textures are still loading.
 *                 The Go server stamps this colour on every newly spawned entity
 *                 so the binary AOI stream always carries the correct RGBA.
 *
 * Character entity types:
 *   player       — the local (self) player
 *   other_player — remote players in the AOI
 *   bot          — AI-controlled entities (behavior: hostile / passive)
 *   skill        — skill-spawned projectile bot (behavior = "skill");
 *                  NOT placed in maps — created at runtime by skill_projectile.go
 *                  when a player/bot triggers a projectile skill.
 *                  liveItemIds carries the skill-type OL (the projectile sprite).
 *   coin         — skill-spawned collectible bot (behavior = "coin");
 *                  NOT placed in maps — dropped at runtime on entity death.
 *
 * World object entity types:
 *   floor / obstacle / portal / foreground
 *
 * @constant
 * @type {ReadonlyArray<{entityType:string, liveItemIds:string[], deadItemIds:string[], colorKey:string}>}
 */
export const ENTITY_TYPE_DEFAULTS = Object.freeze([
  // ── Characters ─────────────────────────────────────────────────────────
  {
    entityType: 'player',
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    colorKey: 'PLAYER',
    // Full default ObjectLayer inventory for newly spawned players.
    // active:false items appear in the inventory bar but are not worn.
    // The coin slot is always active:false — coins are non-activable.
    defaultObjectLayers: [
      { itemId: 'anon',            active: true,  quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true,  quantity: 1 },
      { itemId: 'coin',            active: false, quantity: 0 },
    ],
  },
  {
    entityType: 'other_player',
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    colorKey: 'OTHER_PLAYER',
    defaultObjectLayers: [
      { itemId: 'anon',            active: true,  quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true,  quantity: 1 },
      { itemId: 'coin',            active: false, quantity: 0 },
    ],
  },
  {
    entityType: 'bot',
    liveItemIds: ['purple'],
    deadItemIds: ['ghost'],
    colorKey: 'BOT',
    defaultObjectLayers: [
      { itemId: 'purple', active: true,  quantity: 1 },
      { itemId: 'coin',   active: false, quantity: 0 },
    ],
  },
  { entityType: 'skill', liveItemIds: ['atlas_pistol_mk2_bullet'], deadItemIds: [], colorKey: 'SKILL', defaultObjectLayers: [{ itemId: 'atlas_pistol_mk2_bullet', active: true, quantity: 1 }] },
  { entityType: 'coin',  liveItemIds: ['coin'], deadItemIds: [], colorKey: 'COIN', defaultObjectLayers: [{ itemId: 'coin', active: true, quantity: 1 }] },
  // ── World objects ───────────────────────────────────────────────────────
  { entityType: 'floor',               liveItemIds: ['grass'], deadItemIds: [], colorKey: 'FLOOR',                defaultObjectLayers: [] },
  { entityType: 'obstacle',            liveItemIds: [],        deadItemIds: [], colorKey: 'OBSTACLE',             defaultObjectLayers: [] },
  { entityType: 'portal',              liveItemIds: [],        deadItemIds: [], colorKey: 'PORTAL',               defaultObjectLayers: [] },
  { entityType: 'portal',              liveItemIds: [],        deadItemIds: [], colorKey: 'PORTAL_INTER_PORTAL',  defaultObjectLayers: [] },
  { entityType: 'portal',              liveItemIds: [],        deadItemIds: [], colorKey: 'PORTAL_INTER_RANDOM',  defaultObjectLayers: [] },
  { entityType: 'portal',              liveItemIds: [],        deadItemIds: [], colorKey: 'PORTAL_INTRA_RANDOM',  defaultObjectLayers: [] },
  { entityType: 'portal',              liveItemIds: [],        deadItemIds: [], colorKey: 'PORTAL_INTRA_PORTAL',  defaultObjectLayers: [] },
  { entityType: 'foreground',          liveItemIds: [],        deadItemIds: [], colorKey: 'FOREGROUND',           defaultObjectLayers: [] },
]);

// ── Instance configuration defaults ─────────────────────────────────────────
export const CYBERIA_INSTANCE_CONF_DEFAULTS = {
  // ── Rendering / camera ─────────────────────────────────────────────
  cellSize: 45,
  fps: 60,
  interpolationMs: 100,
  defaultObjWidth: 1,
  defaultObjHeight: 1,
  cameraSmoothing: 0.1,
  cameraZoom: 1.0,
  defaultWidthScreenFactor: 1,
  defaultHeightScreenFactor: 1,
  devUi: false,

  /**
   * Named colour palette forwarded to Go server and C client via the WebSocket
   * init payload.  Entity colour keys (PLAYER, BOT, SKILL, …) are consumed via
   * entityDefaults[n].colorKey as the solid fallback for that entity type when
   * no ObjectLayer items are assigned.
   * The WEAPON key is kept for UI use (weapon-stat highlights) only.
   */
  colors: [
    // ── World ─────────────────────────────────────────────────────
    { key: 'BACKGROUND', r: 30, g: 30, b: 30, a: 255 }, // rgba(30, 30, 30, 1)
    { key: 'FLOOR_BACKGROUND', r: 45, g: 45, b: 45, a: 255 }, // rgba(45, 45, 45, 1)
    { key: 'FLOOR', r: 60, g: 60, b: 60, a: 255 }, // rgba(60, 60, 60, 1)
    { key: 'OBSTACLE', r: 80, g: 80, b: 80, a: 255 }, // rgba(80, 80, 80, 1)
    { key: 'PORTAL', r: 0, g: 200, b: 200, a: 255 }, // rgba(0, 200, 200, 1) — generic fallback
    { key: 'PORTAL_INTER_PORTAL', r: 0, g: 200, b: 200, a: 255 }, // cyan — to portal on another map
    { key: 'PORTAL_INTER_RANDOM', r: 80, g: 130, b: 255, a: 255 }, // blue — to random pos on another map
    { key: 'PORTAL_INTRA_RANDOM', r: 220, g: 200, b: 50, a: 255 }, // yellow — to random pos on same map
    { key: 'PORTAL_INTRA_PORTAL', r: 200, g: 80, b: 200, a: 255 }, // magenta — to portal on same map
    { key: 'FOREGROUND', r: 255, g: 255, b: 255, a: 189 }, // rgba(255, 255, 255, 0.73)
    // ── Entity solid-colour fallbacks (matched by entityDefaults[n].colorKey) ──
    { key: 'PLAYER', r: 0, g: 255, b: 0, a: 255 }, // rgba(0, 255, 0, 1)
    { key: 'OTHER_PLAYER', r: 128, g: 128, b: 255, a: 255 }, // rgba(128, 128, 255, 1)
    { key: 'BOT', r: 255, g: 128, b: 0, a: 255 }, // rgba(255, 128, 0, 1)
    { key: 'GHOST', r: 200, g: 200, b: 255, a: 100 }, // rgba(200, 200, 255, 0.39)
    { key: 'COIN', r: 255, g: 215, b: 0, a: 255 }, // rgba(255, 215, 0, 1)
    { key: 'SKILL', r: 255, g: 255, b: 50, a: 255 }, // rgba(255, 255, 50, 1)
    // ── UI-only ────────────────────────────────────────────────────
    { key: 'WEAPON', r: 180, g: 50, b: 50, a: 255 }, // rgba(180, 50, 50, 1)
  ],

  // ── World / AOI ────────────────────────────────────────────────────
  aoiRadius: 10,
  portalHoldTimeMs: 1000,
  portalSpawnRadius: 3,

  // ── Entity base stats ──────────────────────────────────────────────
  entityBaseSpeed: 5,
  entityBaseMaxLife: 100,
  entityBaseActionCooldownMs: 500,
  entityBaseMinActionCooldownMs: 100,

  // ── Bot defaults ───────────────────────────────────────────────────
  botAggroRange: 10,

  // ── Player defaults ────────────────────────────────────────────────
  defaultPlayerWidth: 2,
  defaultPlayerHeight: 2,
  playerBaseLifeRegenMin: 0.5,
  playerBaseLifeRegenMax: 1.5,
  sumStatsLimit: 500,
  maxActiveLayers: 4,
  initialLifeFraction: 1.0,
  defaultPlayerObjectLayers: [],

  // ── Combat / death ─────────────────────────────────────────────────
  respawnDurationMs: 3000,
  collisionLifeLoss: 10,

  // ── Economy — Fountain & Sink Model ────────────────────────────────
  //
  // All economy parameters live under a single `economyRules` sub-document,
  // mirroring the `skillRules` pattern used by the skill system.
  //
  // This system follows the Fountain & Sink model used by industry-standard
  // MMORPGs (Ultima Online, EverQuest, WoW, EVE Online).
  //   Fountains  — inject new coins into the economy on spawn events.
  //   Kill Transfer — zero-sum redistribution between kill participants.
  //   Sinks      — destroy coins permanently (alpha: all disabled / 0).
  //
  // On-chain bridge (future):
  //   Off-chain coins map 1-to-1 with the CKY token (token ID 0) of the
  //   ObjectLayerToken ERC-1155 contract on Hyperledger Besu.  On auth the
  //   server credits the on-chain balance and this wallet becomes a hot cache.
  //   See hardhat/WHITE-PAPER.md §7 "Tokenomics" and OFF_CHAIN_ECONOMY.md.
  economyRules: {
    // ── Fountains ────────────────────────────────────────────────────
    // Coins bots carry at spawn and on every respawn (infinite mint).
    // Bots always reset to this value so the PvE reward loop never dries up.
    botSpawnCoins: 50,
    // Player starting wallet. No persistence — resets on reconnect (guest mode).
    // Persists only when authenticated with an on-chain wallet (future).
    playerSpawnCoins: 50,

    // ── Kill Transfer (zero-sum redistribution) ───────────────────────
    // Fraction [0,1] of victim coins taken per kill when killing a bot (PvE).
    coinKillPercentVsBot: 0.4,
    // Fraction [0,1] of victim coins taken in PvP — intentionally gentler.
    coinKillPercentVsPlayer: 0.15,
    // Hard floor per kill: guarantees at least this many coins per successful kill.
    coinKillMinAmount: 10,

    // ── Sinks (alpha stubs — all disabled by default) ─────────────────
    // Fraction [0,1] of dead player's coins burned on respawn (0 = disabled).
    respawnCostPercent: 0.0,
    // Flat coins burned per portal use — travel tax (0 = disabled).
    portalFee: 0,
    // Fraction [0,1] of item value burned per crafting action (0 = disabled).
    craftingFeePercent: 0.0,
  },

  // ── Regen ──────────────────────────────────────────────────────────
  lifeRegenChance: 300,
  maxChance: 10000,

  // ── Entity type rendering defaults ─────────────────────────────────
  // Replaces flat fields: userDefaultItemId, botDefaultItemId, ghostItemId,
  // coinItemId, defaultFloorItemId, weaponDefaultItemId.
  // See ENTITY_TYPE_DEFAULTS for documentation of each field.
  // liveItemIds / deadItemIds are arrays of ObjectLayer item IDs.
  entityDefaults: ENTITY_TYPE_DEFAULTS.map((e) => ({ ...e })),

  // ── Skill system ───────────────────────────────────────────────────
  skillConfig: [
    { triggerItemId: 'atlas_pistol_mk2', logicEventIds: ['atlas_pistol_mk2_logic'] },
    { triggerItemId: 'coin', logicEventIds: ['coin_drop_or_transaction'] },
    { triggerItemId: 'anon', logicEventIds: ['doppelganger'] },
  ],

  skillRules: {
    projectileSpawnChance: 0.5,
    projectileLifetimeMs: 2000,
    projectileWidth: 1,
    projectileHeight: 1,
    projectileSpeedMultiplier: 3,
    doppelgangerSpawnChance: 0.5,
    doppelgangerLifetimeMs: 5000,
    doppelgangerSpawnRadius: 3,
    doppelgangerInitialLifeFraction: 1.0,
  },
};
