import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// Expanded metadata for one logic event a trigger item can fire. Mirrors the
// `skills[]` entries in DefaultSkillConfig (cyberia-server-defaults.js) and the
// SkillDefinition consumed by cyberia-server (game/skill.go).
const SkillDefinitionSchema = new Schema(
  {
    // Handler key dispatched by the simulation skill engine (e.g. 'projectile',
    // 'coin_drop_or_transaction', 'doppelganger').
    logicEventId: { type: String, required: true, trim: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    // ObjectLayer item id the skill summons. A leading '$' marks a runtime
    // placeholder resolved by the server (e.g. '$active_skin').
    summonedEntityItemId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

/**
 * Authoritative skill definition for a single trigger item. Owns the full skill
 * record (logic event keys + expanded metadata) so the simulation receives the
 * summoned-entity item ids the instance-conf skillConfig schema does not carry.
 */
const CyberiaSkillSchema = new Schema(
  {
    // ObjectLayer item id whose active layer fires these skills (e.g. 'coin',
    // 'atlas_pistol_mk2'). One skill document per trigger item. The unique
    // index is declared via schema.index() below (not `unique: true` here) to
    // avoid a duplicate-index definition.
    triggerItemId: { type: String, required: true, trim: true },

    // Compact list of handler keys — the discriminator the dispatcher matches.
    logicEventIds: { type: [String], default: [] },

    // Expanded per-logic-event metadata (name, description, summoned entity).
    skills: { type: [SkillDefinitionSchema], default: [] },
  },
  { timestamps: true },
);

CyberiaSkillSchema.index({ triggerItemId: 1 }, { unique: true });

const CyberiaSkillModel = model('CyberiaSkill', CyberiaSkillSchema);

const ProviderSchema = CyberiaSkillSchema;

export { CyberiaSkillSchema, CyberiaSkillModel, ProviderSchema };
