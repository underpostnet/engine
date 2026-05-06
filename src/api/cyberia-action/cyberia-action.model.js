import { Schema, model } from 'mongoose';
import { CYBERIA_ACTION_TYPES } from '../../client/components/cyberia-portal/CommonCyberiaPortal.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    // Spatial origin: the NPC/entity cell that provides this action.
    // Matched against map entity initCellX/initCellY during instance init
    // and assignable from ObjectLayerEngineModal.
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // ── Identity ──────────────────────────────────────────────────────────
    code: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      trim: true,
      enum: CYBERIA_ACTION_TYPES,
    },
    label: { type: String, trim: true, default: '' },

    // The item ID of the NPC/entity that provides this action.
    // Used to match 'talk' quest objectives: a step with { type: 'talk', itemId: X }
    // is satisfied when the player triggers an action where provideItemId === X.
    // Typically the entity's active skin ObjectLayer item ID (e.g. 'wason', 'alex').
    provideItemId: { type: String, trim: true, default: '' },

    // Quest code granted to the player on their first interaction with this action.
    // Used by 'quest-talk' NPCs to start a quest chain on first contact.
    // Empty string = no quest granted.
    grantQuestCode: { type: String, trim: true, default: '' },

    // ── Dialogue ──────────────────────────────────────────────────────────
    // General greeting/intro dialogue shown when the action button is tapped.
    dialogCode: { type: String, trim: true, default: '' },

    // Ordered list of CyberiaDialogue codes the player must view to satisfy
    // a 'talk' quest objective linked to this action via provideItemId.
    // For simple actions this may match dialogCode; for multi-stage NPCs it can diverge.
    questDialogueCodes: [{ type: String, trim: true }],

    // ── Shop payload (type="shop") ─────────────────────────────────────────
    shopItems: [
      {
        itemId: { type: String, required: true, trim: true },
        priceItemId: { type: String, default: 'coin', trim: true },
        priceQty: { type: Number, default: 1, min: 0 },
      },
    ],

    // ── Craft payload (type="craft") ───────────────────────────────────────
    craftRecipes: [
      {
        outputItems: [
          {
            itemId: { type: String, required: true, trim: true },
            qty: { type: Number, default: 1, min: 1 },
          },
        ],
        ingredients: [
          {
            itemId: { type: String, required: true, trim: true },
            qty: { type: Number, default: 1, min: 1 },
          },
        ],
      },
    ],

    // ── Storage payload (type="storage") ──────────────────────────────────
    storageSlots: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

CyberiaActionSchema.index({ code: 1 }, { unique: true });
CyberiaActionSchema.index({ provideItemId: 1 });
CyberiaActionSchema.index({ grantQuestCode: 1 }, { sparse: true });
CyberiaActionSchema.index({ sourceMapCode: 1, sourceCellX: 1, sourceCellY: 1 });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
