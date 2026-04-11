import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

/**
 * CyberiaDialogue — each document is a single dialogue record tied to an
 * item ID from DefaultCyberiaItems.  One item may have many dialogue records
 * (ordered by `order`).  The client displays them sequentially when the
 * player interacts with an entity whose active item layers match `itemId`.
 *
 *   itemId  – references an entry in DefaultCyberiaItems (e.g. "lain", "eiri")
 *   order   – zero-based index governing the display sequence
 *   speaker – display name shown above the dialogue line
 *   text    – the dialogue line itself
 *   mood    – optional emotion hint (neutral / angry / sad / happy / …)
 */
const CyberiaDialogueSchema = new Schema(
  {
    itemId: { type: String, required: true, index: true },
    order: { type: Number, default: 0 },
    speaker: { type: String, default: '' },
    text: { type: String, required: true },
    mood: { type: String, default: 'neutral' },
  },
  {
    timestamps: true,
  },
);

CyberiaDialogueSchema.index({ itemId: 1, order: 1 });

const CyberiaDialogueModel = model('CyberiaDialogue', CyberiaDialogueSchema);

const ProviderSchema = CyberiaDialogueSchema;

export { CyberiaDialogueSchema, CyberiaDialogueModel, ProviderSchema };
