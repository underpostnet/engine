import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// One skill a trigger item carries. Same shape as the `skills[]` entries content abilities
// compile into (the cyberia-content artifact).
const SkillDefinitionSchema = new Schema(
  {
    // The id a manual activation names, unique in its document (SKILL_ID_PATTERN).
    skillId: { type: String, required: true, trim: true },
    // Handler key the simulation runs (e.g. 'projectile', 'coin_drop_or_transaction', 'doppelganger').
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
 * Authoritative skill definition for a single trigger item. Owns the full skill record: each skill
 * with its id, its handler and its metadata, including the summoned-entity item ids the simulation
 * needs. The collection is deployment-wide: which of these an instance runs is derived from the
 * content that instance names, never stored on it. See cyberia-instance-items.js.
 */
const CyberiaSkillSchema = new Schema(
  {
    // ObjectLayer item id that carries these skills (e.g. 'coin',
    // 'atlas_pistol_mk2'). One skill document per trigger item. The unique
    // index is declared via schema.index() below (not `unique: true` here) to
    // avoid a duplicate-index definition.
    triggerItemId: { type: String, required: true, trim: true },

    // The skills the trigger item carries, in their order.
    skills: { type: [SkillDefinitionSchema], default: [] },
  },
  { timestamps: true },
);

CyberiaSkillSchema.index({ triggerItemId: 1 }, { unique: true });

const CyberiaSkillModel = model('CyberiaSkill', CyberiaSkillSchema);

const ProviderSchema = CyberiaSkillSchema;

export { CyberiaSkillSchema, CyberiaSkillModel, ProviderSchema };
