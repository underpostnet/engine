import { Schema, model } from 'mongoose';
import { QUEST_STEPS_TYPES } from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestProgressSchema = new Schema(
  {
    // Matches the Go relay server's player UUID
    playerId: { type: String, required: true, trim: true },
    // References CyberiaQuest.code
    questCode: { type: String, required: true, trim: true },
    // active | completed | failed
    status: {
      type: String,
      required: true,
      enum: ['active', 'completed', 'failed'],
      default: 'active',
    },
    stepProgress: [
      {
        stepId: { type: String, required: true },
        done: { type: Boolean, default: false },
        // One entry per objective in CyberiaQuest.steps[].objectives[]
        objectiveProgress: [
          {
            type: { type: String, required: true, enum: QUEST_STEPS_TYPES },
            itemId: { type: String, required: true },
            current: { type: Number, default: 0, min: 0 },
            required: { type: Number, default: 1, min: 1 },
            done: { type: Boolean, default: false },
          },
        ],
      },
    ],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaQuestProgressSchema.index({ playerId: 1, questCode: 1 }, { unique: true });

const CyberiaQuestProgressModel = model('CyberiaQuestProgress', CyberiaQuestProgressSchema);

const ProviderSchema = CyberiaQuestProgressSchema;

export { CyberiaQuestProgressSchema, CyberiaQuestProgressModel, ProviderSchema };
