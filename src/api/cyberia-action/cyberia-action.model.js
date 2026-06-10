import { Schema, model } from 'mongoose';
import { CYBERIA_ACTION_TYPES } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    // Spatial origin: the NPC/entity cell that provides this action.
    // Matched against map entity initCellX/initCellY during instance init.
    // This is the sole spatial binding — quest validation uses sourceMapCode +
    // sourceCellX + sourceCellY (see CyberiaQuest model).
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

    // Quest code granted to the player on their first interaction with this action.
    // Used by 'quest-talk' NPCs to start a quest chain on first contact.
    // Empty string = no quest granted.
    grantQuestCode: { type: String, trim: true, default: '' },

    // ── Dialogue ──────────────────────────────────────────────────────────
    // General greeting/intro dialogue code shown when the interaction modal
    // is opened for this NPC. Empty = client falls back to /code/default-<skin>
    // resolved from the entity's active skin.
    dialogCode: { type: String, trim: true, default: '' },

    // Ordered list of CyberiaDialogue codes the player must view to satisfy
    // a 'talk' quest objective linked to this action via cell binding.
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
CyberiaActionSchema.index({ grantQuestCode: 1 }, { sparse: true });
CyberiaActionSchema.index({ sourceMapCode: 1, sourceCellX: 1, sourceCellY: 1 });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
