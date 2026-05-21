import { Schema, model } from 'mongoose';
import { CYBERIA_INSTANCE_CONF_DEFAULTS as D } from '../cyberia-server-defaults/cyberia-server-defaults.js';

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

// Per-entity-type simulation defaults. ONLY authoritative item-id wiring
// lives here — presentation (palette, colour keys) is the client's
// responsibility and travels through the CyberiaClientHints REST contract.
const EntityDefaultSchema = new Schema(
  {
    // Entity category string (matches entity_type_str / bot Behavior in game engine)
    entityType: { type: String, required: true },
    // Default ObjectLayer item IDs when the entity is alive and carries no assigned items.
    liveItemIds: { type: [String], default: [] },
    // Default ObjectLayer item IDs for the dead / ghost / respawning state.
    deadItemIds: { type: [String], default: [] },
    // Resource-only inventory items granted on extraction/depletion.
    // These are not auto-activated on the entity itself.
    dropItemIds: { type: [String], default: [] },
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

// ── StatusIconEntrySchema ────────────────────────────────────────────────────
// Numeric Entity Status Indicator (ESI) IDs. The Go server stamps one of
// these u8 IDs on every entity in the AOI binary wire format. Visual
// resolution (icon stem, border colour, bounce) is the C client's job and
// arrives through the /api/cyberia-client-hints REST contract — NOT here.
const StatusIconEntrySchema = new Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false },
);

// ── EconomyRulesSchema ───────────────────────────────────────────────────────
// Mirrors the EconomyRules proto message and the economyRules sub-document in
// cyberia-server-defaults.js.  All fields default from those canonical
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
    // Each entry: { entityType, liveItemIds, deadItemIds, dropItemIds, colorKey }.
    entityDefaults: { type: [EntityDefaultSchema], default: D.entityDefaults },

    // ── Entity Status Indicators ────────────────────────────────────
    // Overhead icon mapping + per-status border colour.
    // See STATUS_ICONS in cyberia-server-defaults.js.
    statusIcons: { type: [StatusIconEntrySchema], default: D.statusIcons },

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
