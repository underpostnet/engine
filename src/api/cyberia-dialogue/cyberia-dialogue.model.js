import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaDialogueSchema = new Schema(
  {
    0: { type: String },
    1: { type: String },
    2: { type: String },
  },
  {
    timestamps: true,
  },
);

const CyberiaDialogueModel = model('CyberiaDialogue', CyberiaDialogueSchema);

const ProviderSchema = CyberiaDialogueSchema;

export { CyberiaDialogueSchema, CyberiaDialogueModel, ProviderSchema };
