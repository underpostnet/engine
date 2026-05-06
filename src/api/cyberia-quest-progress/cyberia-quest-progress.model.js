import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestProgressSchema = new Schema(
  {
    // Matches the Go relay server's player UUID
    playerId: { type: String, required: true, trim: true },
    // References CyberiaQuest.code
    questCode: { type: String, required: true, trim: true },
    // active | completed
    // Quests do not fail — they stay active until completed or abandoned by the player.
    status: {
      type: String,
      required: true,
      enum: ['active', 'completed'],
      default: 'active',
    },
    // One entry per step in the corresponding CyberiaQuest.steps[].
    // A step is complete when all its objectiveProgress entries satisfy current >= required.
    // The active step is the first step where not all objectives are done.
    // done flags are intentionally omitted — completeness is always computed, never stored.
    stepProgress: [
      {
        stepId: { type: String, required: true },
        // One entry per objective in CyberiaQuest.steps[i].objectives[].
        // `required` is denormalized from the quest definition for efficient server checks.
        objectiveProgress: [
          {
            current: { type: Number, default: 0, min: 0 },
            required: { type: Number, default: 1, min: 1 },
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
CyberiaQuestProgressSchema.index({ playerId: 1, status: 1 });

const CyberiaQuestProgressModel = model('CyberiaQuestProgress', CyberiaQuestProgressSchema);

const ProviderSchema = CyberiaQuestProgressSchema;

export { CyberiaQuestProgressSchema, CyberiaQuestProgressModel, ProviderSchema };
