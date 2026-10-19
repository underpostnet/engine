import { Schema, model } from 'mongoose';
import { relationshipError } from './relationship.js';

const CyberiaSocialSchema = new Schema(
  {
    low: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    high: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, expires: 0 },
  },
  { timestamps: true, collection: 'cyberiasocials' },
);

CyberiaSocialSchema.pre('validate', function () {
  const error = relationshipError(this);
  if (error) this.invalidate('low', error);
});

CyberiaSocialSchema.index({ low: 1, high: 1 }, { unique: true });
CyberiaSocialSchema.index({ low: 1, status: 1 });
CyberiaSocialSchema.index({ high: 1, status: 1 });

const CyberiaSocialModel = model('CyberiaSocial', CyberiaSocialSchema);

const ProviderSchema = CyberiaSocialSchema;

export { CyberiaSocialSchema, CyberiaSocialModel, ProviderSchema };
