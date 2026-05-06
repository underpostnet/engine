import { Schema, model } from 'mongoose';
import { ITEM_TYPES, QUEST_STEPS_TYPES } from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestSchema = new Schema(
  {
    // The quest must be provided for the entity that initially
    // matches the initial position 'x' and initial position 'y'
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // Stable slug, e.g. "fallback-intro-quest"
    code: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Other quest codes that must be completed before this one becomes available
    prerequisitesCyberiaQuestCodes: { type: [String], default: [] },
    steps: [
      {
        id: { type: String, required: true },

        description: { type: String, default: '' },
        objectives: [
          {
            // collect | talk | kill
            type: { type: String, required: true, enum: QUEST_STEPS_TYPES },
            itemId: { type: String, default: '' },
            quantity: { type: Number, default: 1 },
          },
        ],
      },
    ],
    rewards: [
      {
        itemId: { type: String, default: '' },
        quantity: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true },
);

CyberiaQuestSchema.index({ code: 1 }, { unique: true });

const CyberiaQuestModel = model('CyberiaQuest', CyberiaQuestSchema);

const ProviderSchema = CyberiaQuestSchema;

export { CyberiaQuestSchema, CyberiaQuestModel, ProviderSchema };
