import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    // The action must be provided by the entity that initially
    // matches the initial position 'x' and initial position 'y'
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // ── Identity ──────────────────────────────────────────────────────────
    code: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      trim: true,
      enum: ['craft', 'shop', 'storage', 'quest-talk'],
    },
    label: { type: String, trim: true, default: '' },

    // General-purpose default dialogue opened for this action (any action type).
    // For quest-talk this is the immediate greeting shown when the button is clicked.
    dialogCode: { type: String, trim: true, default: '' },

    // ── Shop payload (populated when type="shop") ──────────────────
    shopItems: [
      {
        itemId: { type: String, required: true, trim: true },
        priceItemId: { type: String, default: 'coin', trim: true },
        priceQty: { type: Number, default: 1, min: 0 },
      },
    ],

    // ── Craft payload (populated when type="craft") ─────────────────
    craftRecipes: [
      {
        outputsItems: [
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

    // ── Storage payload (populated when type="storage") ─────────────
    storageSlots: { type: Number, default: 0, min: 0 },

    // ── Cyberia dialogue codes for type="quest-talk" ─────────────
    // Ordered list of CyberiaDialogue codes that must all be completed (in
    // sequence) to satisfy quest-talk step validation on the Go relay server.
    // Separate from dialogCode — for simple actions they may share codes;
    // for multi-stage quests the sequences can diverge.
    questDialogueCodes: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

CyberiaActionSchema.index({ code: 1 }, { unique: true });
CyberiaActionSchema.index({ provideItemId: 1 });
CyberiaActionSchema.index({ grantQuestCode: 1 }, { sparse: true });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
