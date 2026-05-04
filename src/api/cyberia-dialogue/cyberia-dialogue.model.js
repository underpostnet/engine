import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

/**
 * CyberiaDialogue — each document is one dialogue line that belongs to a
 * named dialogue group (`code`).  One code groups many ordered lines.
 *
 * Schema fields:
 *   code    – primary grouping key, e.g. "default-lain" or "wason-intro".
 *             The C client fetches all lines for a given code in one request.
 *   order   – zero-based display sequence within the code group.
 *   speaker – display name shown above the dialogue line.
 *   text    – the dialogue line itself.
 *   mood    – optional emotion hint (neutral / angry / sad / happy / …).
 */
const CyberiaDialogueSchema = new Schema(
  {
    code: { type: String, required: true, index: true },
    order: { type: Number, default: 0 },
    speaker: { type: String, default: '' },
    text: { type: String, required: true },
    mood: { type: String, default: 'neutral' },
  },
  {
    timestamps: true,
  },
);

CyberiaDialogueSchema.index({ code: 1, order: 1 });

const CyberiaDialogueModel = model('CyberiaDialogue', CyberiaDialogueSchema);

const ProviderSchema = CyberiaDialogueSchema;

export { CyberiaDialogueSchema, CyberiaDialogueModel, ProviderSchema };
