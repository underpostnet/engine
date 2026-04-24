/**
 * Canonical default values and type definitions for a CyberiaInstanceConf document.
 *
 * Canonical config defaults used by:
 *   - cyberia-instance-conf.model.js  — Mongoose schema `default:` declarations
 *   - grpc-server.js                  — FALLBACK_CONFIG_DEFAULTS for missing instances
 *
 * The canonical entity-type ↔ item-type relationship lives in:
 *   - src/client/components/cyberia-portal/CommonCyberiaPortal.js
 *
 * This file derives its item/entity type enums from that shared module.
 *
 * @module src/api/cyberia-instance-conf/cyberia-instance-conf.defaults.js
 */

import {
  ITEM_TYPES as SHARED_ITEM_TYPES,
  ENTITY_TYPES as SHARED_ENTITY_TYPES,
} from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

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
 * @type {Readonly<Record<string, string>>}
 */
export const ITEM_TYPES = SHARED_ITEM_TYPES;
export const ENTITY_TYPES = SHARED_ENTITY_TYPES;

// ── Entity Status Indicator (ESI) registry ───────────────────────────────────
/**
 * Canonical mapping of server-computed entity status icon IDs to the ui-icon
 * filename stem served from /assets/ui-icons/{iconId}.png.
 *
 * The Go server assigns a status u8 per entity each AOI tick.  The C client
 * receives this mapping dynamically via init_data.statusIcons and uses it to
 * resolve the u8 to an icon filename at runtime.  This JS-side copy is the
 * configuration source of truth; it supports instance-specific icon overrides.
 *
 * Industry standard name: "Overhead Status Indicator" (OSI).
 *   WoW: nameplate colour + debuff icons
 *   FFXIV: enmity/claim icons (red ◆, yellow ●)
 *   UO: skull for murderers, shield for invulnerables
 *
 * IMPORTANT: The numeric IDs MUST stay in sync with:
 *   - Go:  cyberia-server/src/entity_status.go   (StatusNone … StatusResourceExtracted)
 *
 * @constant
 */
export const STATUS_ICONS = Object.freeze([
  {
    id: 0,
    name: 'none',
    iconId: null,
    bounce: false,
    borderColor: { r: 70, g: 70, b: 120, a: 200 },
    description: 'No icon (skill/coin bots, world objects)',
  },
  {
    id: 1,
    name: 'passive',
    iconId: 'arrow-down-gray',
    bounce: false,
    borderColor: { r: 130, g: 140, b: 160, a: 200 },
    description: 'Passive bot — no weapon, non-aggressive',
  },
  {
    id: 2,
    name: 'hostile',
    iconId: 'arrow-down-red',
    bounce: true,
    borderColor: { r: 210, g: 50, b: 50, a: 240 },
    description: 'Hostile bot — has weapon, will aggro',
  },
  {
    id: 3,
    name: 'frozen',
    iconId: 'chat',
    bounce: true,
    borderColor: { r: 80, g: 160, b: 220, a: 240 },
    description: 'Player in FrozenInteractionState (modal open)',
  },
  {
    id: 4,
    name: 'player',
    iconId: 'arrow-down',
    bounce: false,
    borderColor: { r: 60, g: 190, b: 90, a: 240 },
    description: 'Normal player — alive, not frozen',
  },
  {
    id: 5,
    name: 'dead',
    iconId: 'skull',
    bounce: false,
    borderColor: { r: 160, g: 130, b: 200, a: 200 },
    description: 'Entity is dead / respawning',
  },
  {
    id: 6,
    name: 'resource',
    iconId: 'arrow-down-gray',
    bounce: false,
    borderColor: { r: 100, g: 180, b: 80, a: 220 },
    description: 'Resource entity — static, exploitable (wood, minerals, etc.)',
  },
  {
    id: 7,
    name: 'resource-extracted',
    iconId: 'clock',
    bounce: false,
    borderColor: { r: 160, g: 130, b: 200, a: 200 },
    description: 'Resource entity extracted/depleted (dead state)',
  },
]);

// ── Equipment rules ──────────────────────────────────────────────────────────
/**
 * Equipment rules govern which ObjectLayer item types can be simultaneously
 * active on a character entity and enforce the one-active-per-type constraint.
 *
 * The server validates every item_activation request against these rules:
 *   1. Only item types listed in `activeItemTypes` may be activated.
 *   2. When `onePerType` is true (default), activating an item of a given type
 *      automatically deactivates any other active item of the same type.
 *   3. When `requireSkin` is true, the player must always have at least one
 *      active skin if they own any skin-type items.
 *
 * Item types NOT listed in `activeItemTypes` (e.g. 'coin', 'floor') are
 * considered non-activable and their activation requests are rejected.
 *
 * @constant
 * @type {Readonly<{activeItemTypes:string[], onePerType:boolean, requireSkin:boolean}>}
 */
export const EQUIPMENT_RULES_DEFAULTS = Object.freeze({
  // Item types that players are allowed to activate (equip).
  // Types not in this list are non-activable (coins, floors, etc.).
  activeItemTypes: [ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon],
  // Enforce at most one active item per item type.
  onePerType: true,
  // Require at least one active skin when the player owns any skin.
  requireSkin: true,
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
 *   dropItemIds — Array of ObjectLayer item IDs granted to the extractor when
 *                 a resource-type entity is depleted. These are inventory/drop
 *                 items only and are NOT auto-activated on the entity itself.
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
 * @type {ReadonlyArray<{entityType:string, liveItemIds:string[], deadItemIds:string[], dropItemIds:string[], colorKey:string}>}
 */
export const RESOURCE_ENTITY_TYPE_DEFAULTS = Object.freeze([
  Object.freeze({
    entityType: ENTITY_TYPES.resource,
    liveItemIds: ['wood-1'],
    deadItemIds: ['wood-extracted-1'],
    // Until dedicated resource-drop OLs are authored, reuse the wood stack item.
    dropItemIds: ['wood-drop-1'],
    colorKey: 'RESOURCE',
    defaultObjectLayers: [],
  }),
  Object.freeze({
    entityType: ENTITY_TYPES.resource,
    liveItemIds: ['wood-2'],
    deadItemIds: ['wood-extracted-2'],
    dropItemIds: ['wood-drop-2'],
    colorKey: 'RESOURCE',
    defaultObjectLayers: [],
  }),
]);

export const RESOURCE_ENTITY_TYPE_DEFAULT = RESOURCE_ENTITY_TYPE_DEFAULTS[0];

export const ENTITY_TYPE_DEFAULTS = Object.freeze([
  // ── Characters ─────────────────────────────────────────────────────────
  {
    entityType: ENTITY_TYPES.player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    colorKey: 'PLAYER',
    // Full default ObjectLayer inventory for newly spawned players.
    // active:false items appear in the inventory bar but are not worn.
    // The coin slot is always active:false — coins are non-activable.
    defaultObjectLayers: [
      { itemId: 'anon', active: true, quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true, quantity: 1 },
      // { itemId: 'purple', active: false, quantity: 1 },
      { itemId: 'ghost', active: false, quantity: 1 },
      // { itemId: 'gp1', active: false, quantity: 1 },
      // { itemId: 'gp2', active: false, quantity: 1 },
      // { itemId: 'lain', active: false, quantity: 1 },
      // { itemId: 'hatchet', active: false, quantity: 1 },
      // { itemId: 'wason', active: false, quantity: 1 },
      // { itemId: 'scp-2040', active: false, quantity: 1 },
      // { itemId: 'punk', active: false, quantity: 1 },
      // { itemId: 'kaneki', active: false, quantity: 1 },
      // { itemId: 'junko', active: false, quantity: 1 },
      // { itemId: 'eiri', active: false, quantity: 1 },
      // { itemId: 'alex', active: false, quantity: 1 },
      // { itemId: 'agent', active: false, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  {
    entityType: ENTITY_TYPES.other_player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    colorKey: 'OTHER_PLAYER',
    defaultObjectLayers: [
      { itemId: 'anon', active: true, quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true, quantity: 1 },
      // { itemId: 'purple', active: false, quantity: 1 },
      { itemId: 'ghost', active: false, quantity: 1 },
      // { itemId: 'gp1', active: false, quantity: 1 },
      // { itemId: 'gp2', active: false, quantity: 1 },
      // { itemId: 'lain', active: false, quantity: 1 },
      // { itemId: 'hatchet', active: false, quantity: 1 },
      // { itemId: 'wason', active: false, quantity: 1 },
      // { itemId: 'scp-2040', active: false, quantity: 1 },
      // { itemId: 'punk', active: false, quantity: 1 },
      // { itemId: 'kaneki', active: false, quantity: 1 },
      // { itemId: 'junko', active: false, quantity: 1 },
      // { itemId: 'eiri', active: false, quantity: 1 },
      // { itemId: 'alex', active: false, quantity: 1 },
      // { itemId: 'agent', active: false, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['purple'],
    deadItemIds: ['ghost'],
    colorKey: 'BOT',
    defaultObjectLayers: [
      { itemId: 'purple', active: true, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  {
    entityType: ENTITY_TYPES.skill,
    liveItemIds: ['atlas_pistol_mk2_bullet'],
    deadItemIds: [],
    colorKey: 'SKILL',
    defaultObjectLayers: [{ itemId: 'atlas_pistol_mk2_bullet', active: true, quantity: 1 }],
  },
  {
    entityType: ENTITY_TYPES.coin,
    liveItemIds: ['coin'],
    deadItemIds: [],
    colorKey: 'COIN',
    defaultObjectLayers: [{ itemId: 'coin', active: true, quantity: 1 }],
  },
  // ── World objects ───────────────────────────────────────────────────────
  {
    entityType: ENTITY_TYPES.floor,
    liveItemIds: ['grass'],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'FLOOR',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.obstacle,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'OBSTACLE',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.portal,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'PORTAL',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.portal,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'PORTAL_INTER_PORTAL',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.portal,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'PORTAL_INTER_RANDOM',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.portal,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'PORTAL_INTRA_RANDOM',
    defaultObjectLayers: [],
  },
  {
    entityType: 'portal',
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'PORTAL_INTRA_PORTAL',
    defaultObjectLayers: [],
  },
  {
    entityType: ENTITY_TYPES.foreground,
    liveItemIds: [],
    deadItemIds: [],
    dropItemIds: [],
    colorKey: 'FOREGROUND',
    defaultObjectLayers: [],
  },
  // ── Resource entities ────────────────────────────────────────────
  // Static, exploitable map objects (wood, minerals, organic matter, etc.).
  // liveItemIds render while alive, deadItemIds while depleted, and dropItemIds
  // are transferred to the extractor. On respawn, original live OLs are restored.
  ...RESOURCE_ENTITY_TYPE_DEFAULTS,
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
    { key: 'RESOURCE', r: 100, g: 180, b: 80, a: 255 }, // rgba(100, 180, 80, 1)
    // ── UI-only ────────────────────────────────────────────────────
    { key: 'WEAPON', r: 180, g: 50, b: 50, a: 255 }, // rgba(180, 50, 50, 1)
    // ── Interaction overlay — self-player bubble/panel border ──────
    { key: 'SELF_BORDER', r: 220, g: 190, b: 60, a: 240 }, // rgba(220, 190, 60, 0.94) — gold
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
  // liveItemIds / deadItemIds / dropItemIds are arrays of ObjectLayer item IDs.
  entityDefaults: ENTITY_TYPE_DEFAULTS.map((e) => ({ ...e })),

  // ── Entity Status Indicators (ESI) ─────────────────────────────────
  // Overhead icon mapping — documents the u8→icon relationship.
  // Stored in config for future instance-specific overrides.
  // See STATUS_ICONS constant for documentation.
  statusIcons: STATUS_ICONS.map((s) => ({ ...s })),

  // ── Skill system ───────────────────────────────────────────────────
  skillConfig: [
    {
      triggerItemId: 'atlas_pistol_mk2',
      skills: [
        {
          logicEventId: 'projectile',
          name: 'Projectile',
          description:
            'Fires a projectile in the direction of the tap. Spawn chance and lifetime scale with Intelligence and Range.',
          summonedEntityItemId: 'atlas_pistol_mk2_bullet',
        },
      ],
    },
    {
      triggerItemId: 'coin',
      skills: [
        {
          logicEventId: 'coin_drop_or_transaction',
          name: 'Coin Drop',
          description:
            'Coins are dropped automatically when an entity is killed. Transfer amount scales with kill percent rules.',
          summonedEntityItemId: 'coin',
        },
      ],
    },
    {
      triggerItemId: 'anon',
      skills: [
        {
          logicEventId: 'doppelganger',
          name: 'Doppelganger',
          description:
            'Summons a passive clone of yourself that wanders nearby. Spawn chance scales with Intelligence.',
          summonedEntityItemId: '$active_skin',
        },
      ],
    },
    {
      triggerItemId: 'hatchet',
      skills: [
        {
          logicEventId: 'projectile',
          name: 'Projectile',
          description:
            'Fires a projectile in the direction of the tap. Spawn chance and lifetime scale with Intelligence and Range.',
          summonedEntityItemId: 'hatchet-skill',
        },
      ],
    },
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

  // ── Equipment Rules ────────────────────────────────────────────────
  // Governs which item types can be equipped (activated) and enforces
  // the one-active-per-type constraint.  See EQUIPMENT_RULES_DEFAULTS.
  equipmentRules: { ...EQUIPMENT_RULES_DEFAULTS },
};
