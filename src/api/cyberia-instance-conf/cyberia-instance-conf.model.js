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
    cellSize: { type: Number, default: 64 },
    fps: { type: Number, default: 60 },
    interpolationMs: { type: Number, default: 100 },
    defaultObjWidth: { type: Number, default: 1 },
    defaultObjHeight: { type: Number, default: 1 },
    cameraSmoothing: { type: Number, default: 0.1 },
    cameraZoom: { type: Number, default: 1.0 },
    defaultWidthScreenFactor: { type: Number, default: 1 },
    defaultHeightScreenFactor: { type: Number, default: 1 },
    devUi: { type: Boolean, default: false },
    colors: { type: [ColorEntrySchema], default: [] },

    // ── World / AOI ─────────────────────────────────────────────────
    aoiRadius: { type: Number, default: 10 },
    portalHoldTimeMs: { type: Number, default: 1000 },
    portalSpawnRadius: { type: Number, default: 3 },

    // ── Entity base stats ────────────────────────────────────────────
    entityBaseSpeed: { type: Number, default: 5 },
    entityBaseMaxLife: { type: Number, default: 100 },
    entityBaseActionCooldownMs: { type: Number, default: 500 },
    entityBaseMinActionCooldownMs: { type: Number, default: 100 },

    // ── Bot defaults ─────────────────────────────────────────────────
    botAggroRange: { type: Number, default: 10 },

    // ── Player defaults ──────────────────────────────────────────────
    defaultPlayerWidth: { type: Number, default: 2 },
    defaultPlayerHeight: { type: Number, default: 2 },
    playerBaseLifeRegenMin: { type: Number, default: 0.5 },
    playerBaseLifeRegenMax: { type: Number, default: 1.5 },
    sumStatsLimit: { type: Number, default: 500 },
    maxActiveLayers: { type: Number, default: 4 },
    initialLifeFraction: { type: Number, default: 1.0 },
    defaultPlayerObjectLayers: { type: [DefaultPlayerObjectLayerSchema], default: [] },

    // ── Combat / death ───────────────────────────────────────────────
    respawnDurationMs: { type: Number, default: 3000 },
    ghostItemId: { type: String, default: '' },
    collisionLifeLoss: { type: Number, default: 10 },

    // ── Economy ──────────────────────────────────────────────────────
    coinItemId: { type: String, default: '' },
    defaultCoinQuantity: { type: Number, default: 1 },

    // ── Regen ────────────────────────────────────────────────────────
    lifeRegenChance: { type: Number, default: 300 },
    maxChance: { type: Number, default: 10000 },

    // ── Floor defaults ───────────────────────────────────────────────
    defaultFloorItemId: { type: String, default: '' },

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
