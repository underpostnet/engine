import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestSchema = new Schema(
  {
    // Stable slug, e.g. "fallback-intro-quest"
    code: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Item id of the NPC that issues this quest, e.g. "wason"
    npcItemId: { type: String, required: true, trim: true },
    // Other quest ids that must be completed before this one becomes available
    prerequisites: { type: [String], default: [] },
    steps: [
      {
        id: { type: String, required: true },
        // collect | talk | kill
        type: { type: String, required: true, enum: ['collect', 'talk', 'kill'] },
        description: { type: String, default: '' },
        // collect: item that must be in inventory
        itemId: { type: String, default: '' },
        quantity: { type: Number, default: 1 },
        // talk: npc item id the player must speak with
        npcItemId: { type: String, default: '' },
        // kill: item id of the entity skin to kill
        entityItemId: { type: String, default: '' },
        killCount: { type: Number, default: 1 },
        // Branch support: at least one of these step ids must be completed
        // (empty = this step is required, not optional)
        anyOf: { type: [String], default: [] },
      },
    ],
    rewards: [
      {
        // item | coin
        type: { type: String, required: true, enum: ['item', 'coin'] },
        itemId: { type: String, default: '' },
        quantity: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true },
);

CyberiaQuestSchema.index({ code: 1 }, { unique: true });
CyberiaQuestSchema.index({ npcItemId: 1 });

const CyberiaQuestModel = model('CyberiaQuest', CyberiaQuestSchema);

const ProviderSchema = CyberiaQuestSchema;

export { CyberiaQuestSchema, CyberiaQuestModel, ProviderSchema };
