import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    sourceMapCode: { type: String, required: true, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

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
    questDialogueCodes: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

CyberiaActionSchema.index({ code: 1 }, { unique: true });
CyberiaActionSchema.index({ provideItemId: 1 });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
