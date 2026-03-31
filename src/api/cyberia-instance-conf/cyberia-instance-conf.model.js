import { Schema, model } from 'mongoose';

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
    bulletSpawnChance: { type: Number, default: 0 },
    bulletLifetimeMs: { type: Number, default: 0 },
    bulletWidth: { type: Number, default: 0 },
    bulletHeight: { type: Number, default: 0 },
    bulletSpeedMultiplier: { type: Number, default: 0 },
    doppelgangerSpawnChance: { type: Number, default: 0 },
    doppelgangerLifetimeMs: { type: Number, default: 0 },
    doppelgangerSpawnRadius: { type: Number, default: 0 },
    doppelgangerInitialLifeFraction: { type: Number, default: 0 },
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
    cellSize: { type: Number },
    fps: { type: Number },
    interpolationMs: { type: Number },
    defaultObjWidth: { type: Number },
    defaultObjHeight: { type: Number },
    cameraSmoothing: { type: Number },
    cameraZoom: { type: Number },
    defaultWidthScreenFactor: { type: Number },
    defaultHeightScreenFactor: { type: Number },
    devUi: { type: Boolean },
    colors: { type: [ColorEntrySchema], default: [] },

    // ── World / AOI ─────────────────────────────────────────────────
    aoiRadius: { type: Number },
    portalHoldTimeMs: { type: Number },
    portalSpawnRadius: { type: Number },

    // ── Entity base stats ────────────────────────────────────────────
    entityBaseSpeed: { type: Number },
    entityBaseMaxLife: { type: Number },
    entityBaseActionCooldownMs: { type: Number },
    entityBaseMinActionCooldownMs: { type: Number },

    // ── Bot defaults ─────────────────────────────────────────────────
    botAggroRange: { type: Number },

    // ── Player defaults ──────────────────────────────────────────────
    defaultPlayerWidth: { type: Number },
    defaultPlayerHeight: { type: Number },
    playerBaseLifeRegenMin: { type: Number },
    playerBaseLifeRegenMax: { type: Number },
    sumStatsLimit: { type: Number },
    maxActiveLayers: { type: Number },
    initialLifeFraction: { type: Number },
    defaultPlayerObjectLayers: { type: [DefaultPlayerObjectLayerSchema], default: [] },

    // ── Combat / death ───────────────────────────────────────────────
    respawnDurationMs: { type: Number },
    ghostItemId: { type: String },
    collisionLifeLoss: { type: Number },

    // ── Economy ──────────────────────────────────────────────────────
    coinItemId: { type: String },
    defaultCoinQuantity: { type: Number },

    // ── Regen ────────────────────────────────────────────────────────
    lifeRegenChance: { type: Number },
    maxChance: { type: Number },

    // ── Floor defaults ───────────────────────────────────────────────
    defaultFloorItemId: { type: String },

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
