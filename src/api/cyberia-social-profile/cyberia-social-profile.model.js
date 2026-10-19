import { Schema, model } from 'mongoose';
import { validStatusNote } from '../cyberia-social/social-contract.js';

const CyberiaSocialProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    note: { type: String, default: '', validate: validStatusNote },
    noteUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'cyberiasocialprofiles' },
);

const CyberiaSocialProfileModel = model('CyberiaSocialProfile', CyberiaSocialProfileSchema);

const ProviderSchema = CyberiaSocialProfileSchema;

export { CyberiaSocialProfileSchema, CyberiaSocialProfileModel, ProviderSchema };
