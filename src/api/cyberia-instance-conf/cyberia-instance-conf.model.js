import { Schema, model } from 'mongoose';
import { CYBERIA_INSTANCE_CONF_DEFAULTS as D } from './cyberia-instance-conf.defaults.js';

const ColorEntrySchema = new Schema(
  {
    key: { type: String, required: true },
    r: { type: Number, default: 0 },
    g: { type: Number, default: 0 },
    b: { type: Number, default: 0 },
    a: { type: Number, default: 255 },
  },
  { _id: false },
);

// ObjectLayer inventory slot: itemId + whether it starts active + initial quantity.
// Used by EntityDefaultSchema.defaultObjectLayers.
const ObjectLayerSlotSchema = new Schema(
  {
    itemId: { type: String, required: true },
    active: { type: Boolean, default: false },
    quantity: { type: Number, default: 1 },
  },
  { _id: false },
);

const EntityDefaultSchema = new Schema(
  {
    // Entity category string (matches entity_type_str / bot Behavior in game engine)
    entityType: { type: String, required: true },
    // Default ObjectLayer item IDs when the entity is alive and carries no assigned items.
    liveItemIds: { type: [String], default: [] },
    // Default ObjectLayer item IDs for the dead / ghost / respawning state.
    // Empty array = use liveItemIds solid fill color.
    deadItemIds: { type: [String], default: [] },
    // Palette key for solid-color fallback when no OL items are assigned.
    colorKey: { type: String, default: '' },
    // Full default ObjectLayer inventory for this entity type.
    // Each entry specifies itemId, whether it starts active, and its initial quantity.
    // The coin slot must always have active:false — coins are non-activable.
    // When non-empty this supersedes liveItemIds for inventory initialization.
    defaultObjectLayers: { type: [ObjectLayerSlotSchema], default: [] },
  },
  { _id: false },
);

const SkillConfigEntrySchema = new Schema(
  {
    triggerItemId: { type: String, required: true },
    logicEventIds: { type: [String], default: [] },
  },
  { _id: false },
);

// ── EconomyRulesSchema ───────────────────────────────────────────────────────
// Mirrors the EconomyRules proto message and the economyRules sub-document in
// cyberia-instance-conf.defaults.js.  All fields default from those canonical
// values so a freshly created document is immediately playable.
// See OFF_CHAIN_ECONOMY.md for the full Fountain & Sink architecture.
const EconomyRulesSchema = new Schema(
  {
    // ── Fountains ───────────────────────────────────────────────────────────
    botSpawnCoins: { type: Number, default: D.economyRules.botSpawnCoins },
    playerSpawnCoins: { type: Number, default: D.economyRules.playerSpawnCoins },
    // ── Kill Transfer ───────────────────────────────────────────────────────
    coinKillPercentVsBot: { type: Number, default: D.economyRules.coinKillPercentVsBot },
    coinKillPercentVsPlayer: { type: Number, default: D.economyRules.coinKillPercentVsPlayer },
    coinKillMinAmount: { type: Number, default: D.economyRules.coinKillMinAmount },
    // ── Sinks ───────────────────────────────────────────────────────────────
    respawnCostPercent: { type: Number, default: D.economyRules.respawnCostPercent },
    portalFee: { type: Number, default: D.economyRules.portalFee },
    craftingFeePercent: { type: Number, default: D.economyRules.craftingFeePercent },
  },
  { _id: false },
);

// ── EquipmentRulesSchema ─────────────────────────────────────────────────────
// Governs which ObjectLayer item types can be simultaneously active on a
// character entity and enforces the one-active-per-type constraint.
// See EQUIPMENT_RULES_DEFAULTS in cyberia-instance-conf.defaults.js.
const EquipmentRulesSchema = new Schema(
  {
    // Item types that players are allowed to activate (equip).
    // Types not in this list are non-activable (coins, floors, etc.).
    activeItemTypes: { type: [String], default: D.equipmentRules.activeItemTypes },
    // Enforce at most one active item per item type.
    onePerType: { type: Boolean, default: D.equipmentRules.onePerType },
    // Require at least one active skin when the player owns any skin.
    requireSkin: { type: Boolean, default: D.equipmentRules.requireSkin },
  },
  { _id: false },
);

const SkillRulesSchema = new Schema(
  {
    projectileSpawnChance: { type: Number, default: D.skillRules.projectileSpawnChance },
    projectileLifetimeMs: { type: Number, default: D.skillRules.projectileLifetimeMs },
    projectileWidth: { type: Number, default: D.skillRules.projectileWidth },
    projectileHeight: { type: Number, default: D.skillRules.projectileHeight },
    projectileSpeedMultiplier: { type: Number, default: D.skillRules.projectileSpeedMultiplier },
    doppelgangerSpawnChance: { type: Number, default: D.skillRules.doppelgangerSpawnChance },
    doppelgangerLifetimeMs: { type: Number, default: D.skillRules.doppelgangerLifetimeMs },
    doppelgangerSpawnRadius: { type: Number, default: D.skillRules.doppelgangerSpawnRadius },
    doppelgangerInitialLifeFraction: { type: Number, default: D.skillRules.doppelgangerInitialLifeFraction },
  },
  { _id: false },
);

/**
 * Game server configuration for a Cyberia instance.
 * Separated from CyberiaInstance so the GUI never overwrites live server parameters
 * when editing instance identity / map-graph fields.
 *
 * Linked from CyberiaInstance.conf (ObjectId ref).
 * Looked up by instanceCode for CLI / gRPC use.
 */
const CyberiaInstanceConfSchema = new Schema(
  {
    // Back-reference to the owning instance (indexed for fast lookup by code).
    instanceCode: { type: String, required: true, unique: true, trim: true },

    // ── Rendering / camera ──────────────────────────────────────────
    cellSize: { type: Number, default: D.cellSize },
    fps: { type: Number, default: D.fps },
    interpolationMs: { type: Number, default: D.interpolationMs },
    defaultObjWidth: { type: Number, default: D.defaultObjWidth },
    defaultObjHeight: { type: Number, default: D.defaultObjHeight },
    cameraSmoothing: { type: Number, default: D.cameraSmoothing },
    cameraZoom: { type: Number, default: D.cameraZoom },
    defaultWidthScreenFactor: { type: Number, default: D.defaultWidthScreenFactor },
    defaultHeightScreenFactor: { type: Number, default: D.defaultHeightScreenFactor },
    devUi: { type: Boolean, default: D.devUi },
    // Empty array by default — colours must be configured per-instance.
    // toInstanceConfig() fills in CYBERIA_INSTANCE_CONF_DEFAULTS.colors when the array is empty.
    colors: { type: [ColorEntrySchema], default: [] },

    // ── World / AOI ─────────────────────────────────────────────────
    aoiRadius: { type: Number, default: D.aoiRadius },
    portalHoldTimeMs: { type: Number, default: D.portalHoldTimeMs },
    portalSpawnRadius: { type: Number, default: D.portalSpawnRadius },

    // ── Entity base stats ────────────────────────────────────────────
    entityBaseSpeed: { type: Number, default: D.entityBaseSpeed },
    entityBaseMaxLife: { type: Number, default: D.entityBaseMaxLife },
    entityBaseActionCooldownMs: { type: Number, default: D.entityBaseActionCooldownMs },
    entityBaseMinActionCooldownMs: { type: Number, default: D.entityBaseMinActionCooldownMs },

    // ── Bot defaults ─────────────────────────────────────────────────
    botAggroRange: { type: Number, default: D.botAggroRange },

    // ── Player defaults ──────────────────────────────────────────────
    defaultPlayerWidth: { type: Number, default: D.defaultPlayerWidth },
    defaultPlayerHeight: { type: Number, default: D.defaultPlayerHeight },
    playerBaseLifeRegenMin: { type: Number, default: D.playerBaseLifeRegenMin },
    playerBaseLifeRegenMax: { type: Number, default: D.playerBaseLifeRegenMax },
    sumStatsLimit: { type: Number, default: D.sumStatsLimit },
    maxActiveLayers: { type: Number, default: D.maxActiveLayers },
    initialLifeFraction: { type: Number, default: D.initialLifeFraction },

    // ── Combat / death ───────────────────────────────────────────────
    respawnDurationMs: { type: Number, default: D.respawnDurationMs },
    collisionLifeLoss: { type: Number, default: D.collisionLifeLoss },

    // ── Economy ──────────────────────────────────────────────────────
    // Fountain & Sink parameters. See EconomyRulesSchema and OFF_CHAIN_ECONOMY.md.
    economyRules: { type: EconomyRulesSchema },

    // ── Regen ────────────────────────────────────────────────────────
    lifeRegenChance: { type: Number, default: D.lifeRegenChance },
    maxChance: { type: Number, default: D.maxChance },

    // ── Entity type rendering defaults ───────────────────────────────
    // Replaces flat fields: userDefaultItemId, botDefaultItemId, ghostItemId,
    // coinItemId, defaultFloorItemId, weaponDefaultItemId.
    // Each entry: { entityType, liveItemIds, deadItemIds, colorKey }.
    entityDefaults: { type: [EntityDefaultSchema], default: D.entityDefaults },

    // ── Skill system ─────────────────────────────────────────────────
    // Each entry maps a trigger item to an ordered list of logic handler keys.
    // Spawning entities (e.g. projectiles) is handled inside the logic handler itself.
    skillConfig: { type: [SkillConfigEntrySchema], default: [] },

    // Numeric tuning parameters for each skill archetype.
    skillRules: { type: SkillRulesSchema },

    // ── Equipment rules ──────────────────────────────────────────────
    // Governs which item types can be simultaneously active and enforces
    // the one-active-per-type constraint.  See EQUIPMENT_RULES_DEFAULTS.
    equipmentRules: { type: EquipmentRulesSchema },
  },
  { timestamps: true },
);

const CyberiaInstanceConfModel = model('CyberiaInstanceConf', CyberiaInstanceConfSchema);

const ProviderSchema = CyberiaInstanceConfSchema;

export { CyberiaInstanceConfSchema, CyberiaInstanceConfModel, ProviderSchema };
