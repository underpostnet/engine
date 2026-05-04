import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestProgressSchema = new Schema(
  {
    // Matches the Go relay server's player UUID
    playerId: { type: String, required: true, trim: true },
    questId: { type: String, required: true, trim: true },
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
        // pending | completed
        status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
        // running count for collect/kill steps
        count: { type: Number, default: 0 },
      },
    ],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaQuestProgressSchema.index({ playerId: 1, questId: 1 }, { unique: true });

const CyberiaQuestProgressModel = model('CyberiaQuestProgress', CyberiaQuestProgressSchema);

const ProviderSchema = CyberiaQuestProgressSchema;

export { CyberiaQuestProgressSchema, CyberiaQuestProgressModel, ProviderSchema };
