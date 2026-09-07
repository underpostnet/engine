import { Schema, model } from 'mongoose';
import { CYBERIA_INSTANCE_CONF_DEFAULTS as D } from '../cyberia-server-defaults/cyberia-server-defaults.js';

// ── StatusIconEntrySchema ────────────────────────────────────────────────────
// Numeric Entity Status Indicator (ESI) IDs. The server stamps one u8 ID on
// every entity in the AOI wire format. The icon visuals belong to the client
// and travel through /api/cyberia-client-hints, not here.
const StatusIconEntrySchema = new Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false },
);

// ── EconomyRulesSchema ───────────────────────────────────────────────────────
// The EconomyRules message shape. Every field defaults from
// cyberia-server-defaults.js, so a new document is playable at once.
// See OFF_CHAIN_ECONOMY.md for the Fountain & Sink architecture.
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
// See EQUIPMENT_RULES_DEFAULTS in cyberia-server-defaults.js.
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
 * Simulation configuration for a Cyberia instance. It is separate from
 * CyberiaInstance so an edit to instance identity or map graph cannot
 * overwrite live simulation parameters.
 *
 * Linked from CyberiaInstance.conf (ObjectId ref), looked up by instanceCode.
 */
const CyberiaInstanceConfSchema = new Schema(
  {
    // Back-reference to the owning instance (indexed for fast lookup by code).
    instanceCode: { type: String, required: true, unique: true, trim: true },

    // ── Tick model (authoritative simulation cadence) ─────────────────
    tickRate: { type: Number, default: D.tickRate },
    snapshotRate: { type: Number, default: D.snapshotRate },

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
    playerBaseSpeed: { type: Number, default: D.playerBaseSpeed },
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

    // ── Entity type defaults ─────────────────────────────────────────
    // References into the CyberiaEntityTypeDefault collection, which owns the
    // per-entity-type item wiring (live/dead/drop sets, seed inventory, behavior).
    //
    // A reference, never a copy. Embedding the documents here meant the same
    // wiring existed twice — once in the collection, once inside every instance
    // conf — and the two were reconciled by matching item ids, so two instances
    // sharing a skin resolved into each other's defaults on import and export.
    // An id names exactly one document, which is what makes that impossible.
    //
    // An empty list is not "no defaults": it means this instance adds nothing to
    // the canonical ENTITY_TYPE_DEFAULTS, which every world resolves against.
    entityDefaults: {
      type: [{ type: Schema.Types.ObjectId, ref: 'CyberiaEntityTypeDefault' }],
      default: D.entityDefaults,
    },

    // ── Entity Status Indicators ────────────────────────────────────
    // Overhead icon mapping + per-status border colour.
    // See STATUS_ICONS in cyberia-server-defaults.js.
    statusIcons: { type: [StatusIconEntrySchema], default: D.statusIcons },

    // ── Skill system ─────────────────────────────────────────────────
    // Which skills an instance runs is not stored: the CyberiaSkill collection owns the
    // definitions, and an instance runs the ones whose trigger item its own content names.
    // See collectInstanceItemIds / selectInstanceSkills (cyberia-instance-items.js). Storing
    // the list here meant maintaining a second answer to that question, and the two disagreed —
    // a trigger a quest asked for exported but never reached the simulation.

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
