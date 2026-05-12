import { Schema, model } from 'mongoose';
import { QUEST_STEPS_TYPES } from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestSchema = new Schema(
  {
    // Spatial origin: the NPC/entity cell that grants this quest.
    // Matched against map entity initCellX/initCellY during instance init
    // and assignable from ObjectLayerEngineModal.
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // Stable slug, e.g. "fallback-intro-quest"
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // ── Chain / tree unlock structure ─────────────────────────────────────
    // All listed quest codes must be completed before this quest becomes
    // available (AND logic). Empty array = no prerequisites.
    prerequisiteCodes: { type: [String], default: [] },

    // Quest codes unlocked when this quest is completed.
    // Supports both chain (one successor) and tree (multiple successors).
    // The server re-checks prerequisiteCodes on each target before activating it.
    unlocksQuestCodes: { type: [String], default: [] },

    // ── Steps ─────────────────────────────────────────────────────────────
    // Ordered linear sequence. The active step is always the first incomplete one.
    steps: [
      {
        id: { type: String, required: true },
        description: { type: String, default: '' },
        objectives: [
          {
            // collect — itemId = item that must appear in the player's inventory
            // talk    — itemId = provideItemId of the CyberiaAction to interact with
            // kill    — itemId = skin item ID of the target entity
            type: { type: String, required: true, enum: QUEST_STEPS_TYPES },
            itemId: { type: String, required: true, trim: true },
            quantity: { type: Number, default: 1, min: 1 },
          },
        ],
      },
    ],

    // ── Rewards ───────────────────────────────────────────────────────────
    rewards: [
      {
        itemId: { type: String, required: true, trim: true },
        quantity: { type: Number, default: 1, min: 1 },
      },
    ],
  },
  { timestamps: true },
);

CyberiaQuestSchema.index({ code: 1 }, { unique: true });
CyberiaQuestSchema.index({ sourceMapCode: 1, sourceCellX: 1, sourceCellY: 1 });

const CyberiaQuestModel = model('CyberiaQuest', CyberiaQuestSchema);

const ProviderSchema = CyberiaQuestSchema;

export { CyberiaQuestSchema, CyberiaQuestModel, ProviderSchema };
