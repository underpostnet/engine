import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    // Spatial origin: the cell whose matching bot entity provides this action.
    // An action has NO type — its capabilities are whatever payloads are
    // populated (questDialogueCodes / shopItems / craftRecipes / storageSlots),
    // resolved per player. The quest-provider capability is active when there
    // are CyberiaQuests bound to this same (sourceMapCode, sourceCellX,
    // sourceCellY).
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // ── Identity ──────────────────────────────────────────────────────────
    // `code` is a generic, location-scoped slug (it associates the action with
    // its cell, not a single behavior). `label` is the name shown on the bot's
    // overhead nameplate (the client fetches it by code via REST).
    code: { type: String, required: true, trim: true },
    label: { type: String, trim: true, default: '' },

    // ── Dialogue ──────────────────────────────────────────────────────────
    // General greeting shown when the interaction modal opens. Empty = client
    // falls back to /code/default-<skin> from the entity's active skin.
    dialogCode: { type: String, trim: true, default: '' },

    // Per-quest dialogue map: the CyberiaDialogue code to display for each quest
    // this NPC handles. The server validates a `talk` objective only when the
    // viewed dialogCode matches the entry for that quest.
    questDialogueCodes: [
      {
        questCode: { type: String, required: true, trim: true },
        dialogCode: { type: String, required: true, trim: true },
      },
    ],

    // ── Shop payload ──────────────────────────────────────────────────────
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
CyberiaActionSchema.index({ sourceMapCode: 1, sourceCellX: 1, sourceCellY: 1 });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
