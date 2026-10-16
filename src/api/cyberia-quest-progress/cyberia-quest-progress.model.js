import { Schema, model } from 'mongoose';

const QUEST_STATUSES = Object.freeze(['active', 'completed']);

const CyberiaQuestProgressSchema = new Schema(
  {
    // The profile that owns the progress. The profile names the world.
    player: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true },
    // References CyberiaQuest.code
    questCode: { type: String, required: true, trim: true },
    // An abandoned quest has no record, so it can be accepted again.
    status: { type: String, required: true, enum: QUEST_STATUSES, default: 'active' },
    // One entry per step in the corresponding CyberiaQuest.steps[].
    // A step is complete when all its objectiveProgress entries satisfy current >= required.
    stepProgress: [
      {
        _id: false,
        stepId: { type: String, required: true },
        // One entry per objective in CyberiaQuest.steps[i].objectives[]; `required` is copied from
        // the quest definition when the quest starts.
        objectiveProgress: [
          {
            _id: false,
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

CyberiaQuestProgressSchema.index({ player: 1, questCode: 1 }, { unique: true });

const CyberiaQuestProgressModel = model('CyberiaQuestProgress', CyberiaQuestProgressSchema);

const ProviderSchema = CyberiaQuestProgressSchema;

export { CyberiaQuestProgressSchema, CyberiaQuestProgressModel, ProviderSchema, QUEST_STATUSES };
