import { Schema, model } from 'mongoose';
import { CYBERIA_INSTANCE_CONF_DEFAULTS as D } from './cyberia-instance-conf.defaults.js';

const EntityDefaultSchema = new Schema(
  {
    // Entity category string (matches entity_type_str / bot Behavior in game engine)
    entityType: { type: String, required: true },
    // Default ObjectLayer item ID when the entity is alive and carries no assigned items.
    liveItemId: { type: String, default: '' },
    // Default ObjectLayer item ID for the dead / ghost / respawning state.
    // Empty string = use liveItemId solid fill color.
    deadItemId: { type: String, default: '' },
    // Palette key for solid-color fallback when no OL items are assigned.
    colorKey: { type: String, default: '' },
  },
  { _id: false },
);

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

const DefaultPlayerObjectLayerSchema = new Schema(
  {
    itemId: { type: String, required: true },
    active: { type: Boolean, default: false },
    quantity: { type: Number, default: 1 },
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

const SkillRulesSchema = new Schema(
  {
    bulletSpawnChance: { type: Number, default: D.skillRules.bulletSpawnChance },
    bulletLifetimeMs: { type: Number, default: D.skillRules.bulletLifetimeMs },
    bulletWidth: { type: Number, default: D.skillRules.bulletWidth },
    bulletHeight: { type: Number, default: D.skillRules.bulletHeight },
    bulletSpeedMultiplier: { type: Number, default: D.skillRules.bulletSpeedMultiplier },
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
    defaultPlayerObjectLayers: { type: [DefaultPlayerObjectLayerSchema], default: [] },

    // ── Combat / death ───────────────────────────────────────────────
    respawnDurationMs: { type: Number, default: D.respawnDurationMs },
    collisionLifeLoss: { type: Number, default: D.collisionLifeLoss },

    // ── Economy ──────────────────────────────────────────────────────
    defaultCoinQuantity: { type: Number, default: D.defaultCoinQuantity },

    // ── Regen ────────────────────────────────────────────────────────
    lifeRegenChance: { type: Number, default: D.lifeRegenChance },
    maxChance: { type: Number, default: D.maxChance },

    // ── Entity type rendering defaults ───────────────────────────────
    // Replaces flat fields: userDefaultItemId, botDefaultItemId, ghostItemId,
    // coinItemId, defaultFloorItemId, bulletDefaultItemId, weaponDefaultItemId.
    // Each entry: { entityType, liveItemId, deadItemId, colorKey }.
    entityDefaults: { type: [EntityDefaultSchema], default: D.entityDefaults },

    // ── Skill system ─────────────────────────────────────────────────
    // Each entry maps a trigger item to an ordered list of logic handler keys.
    // Spawning entities (e.g. bullets) is handled inside the logic handler itself.
    skillConfig: { type: [SkillConfigEntrySchema], default: [] },

    // Numeric tuning parameters for each skill archetype.
    skillRules: { type: SkillRulesSchema },
  },
  { timestamps: true },
);

const CyberiaInstanceConfModel = model('CyberiaInstanceConf', CyberiaInstanceConfSchema);

const ProviderSchema = CyberiaInstanceConfSchema;

export { CyberiaInstanceConfSchema, CyberiaInstanceConfModel, ProviderSchema };
