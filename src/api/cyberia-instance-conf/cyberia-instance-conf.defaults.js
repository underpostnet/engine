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
 *   liveItemId  — ObjectLayer item ID used when the entity is alive/active and
 *                 no explicit items are assigned.  Empty string = no OL fallback,
 *                 rely on colorKey solid fill.
 *   deadItemId  — ObjectLayer item ID for the dead / ghost / respawning state.
 *                 Empty string = no dead-state OL; same solid fill as live.
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
 *                  liveItemId is a skill-type OL (the projectile sprite).
 *   coin         — skill-spawned collectible bot (behavior = "coin");
 *                  NOT placed in maps — dropped at runtime on entity death.
 *
 * World object entity types:
 *   floor / obstacle / portal / foreground
 *
 * @constant
 * @type {ReadonlyArray<{entityType:string, liveItemId:string, deadItemId:string, colorKey:string}>}
 */
export const ENTITY_TYPE_DEFAULTS = Object.freeze([
  // ── Characters ─────────────────────────────────────────────────────────
  { entityType: 'player', liveItemId: 'anon', deadItemId: 'ghost', colorKey: 'PLAYER' },
  { entityType: 'other_player', liveItemId: 'anon', deadItemId: 'ghost', colorKey: 'OTHER_PLAYER' },
  { entityType: 'bot', liveItemId: 'purple', deadItemId: 'ghost', colorKey: 'BOT' },
  { entityType: 'skill', liveItemId: 'atlas_pistol_mk2_bullet', deadItemId: '', colorKey: 'SKILL' },
  { entityType: 'coin', liveItemId: 'coin', deadItemId: '', colorKey: 'COIN' },
  // ── World objects ───────────────────────────────────────────────────────
  { entityType: 'floor', liveItemId: 'grass', deadItemId: '', colorKey: 'FLOOR' },
  { entityType: 'obstacle', liveItemId: '', deadItemId: '', colorKey: 'OBSTACLE' },
  { entityType: 'portal', liveItemId: '', deadItemId: '', colorKey: 'PORTAL' },
  { entityType: 'foreground', liveItemId: '', deadItemId: '', colorKey: 'FOREGROUND' },
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
    { key: 'BACKGROUND', r: 30, g: 30, b: 30, a: 255 },
    { key: 'FLOOR_BACKGROUND', r: 45, g: 45, b: 45, a: 255 },
    { key: 'FLOOR', r: 60, g: 60, b: 60, a: 255 },
    { key: 'OBSTACLE', r: 80, g: 80, b: 80, a: 255 },
    { key: 'PORTAL', r: 0, g: 200, b: 200, a: 255 },
    { key: 'FOREGROUND', r: 200, g: 200, b: 200, a: 80 },
    // ── Entity solid-colour fallbacks (matched by entityDefaults[n].colorKey) ──
    { key: 'PLAYER', r: 0, g: 255, b: 0, a: 255 },
    { key: 'OTHER_PLAYER', r: 128, g: 128, b: 255, a: 255 },
    { key: 'BOT', r: 255, g: 128, b: 0, a: 255 },
    { key: 'GHOST', r: 200, g: 200, b: 255, a: 100 },
    { key: 'COIN', r: 255, g: 215, b: 0, a: 255 },
    { key: 'SKILL', r: 255, g: 255, b: 50, a: 255 },
    // ── UI-only ────────────────────────────────────────────────────
    { key: 'WEAPON', r: 180, g: 50, b: 50, a: 255 },
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

  // ── Economy ────────────────────────────────────────────────────────
  defaultCoinQuantity: 1,

  // ── Regen ──────────────────────────────────────────────────────────
  lifeRegenChance: 300,
  maxChance: 10000,

  // ── Entity type rendering defaults ─────────────────────────────────
  // Replaces flat fields: userDefaultItemId, botDefaultItemId, ghostItemId,
  // coinItemId, defaultFloorItemId, weaponDefaultItemId.
  // See ENTITY_TYPE_DEFAULTS for documentation of each field.
  entityDefaults: ENTITY_TYPE_DEFAULTS.map((e) => ({ ...e })),

  // ── Skill system ───────────────────────────────────────────────────
  skillConfig: [],

  skillRules: {
    projectileSpawnChance: 0,
    projectileLifetimeMs: 0,
    projectileWidth: 0,
    projectileHeight: 0,
    projectileSpeedMultiplier: 0,
    doppelgangerSpawnChance: 0,
    doppelgangerLifetimeMs: 0,
    doppelgangerSpawnRadius: 0,
    doppelgangerInitialLifeFraction: 0,
  },
};
