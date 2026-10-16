/**
 * Mongoose model for `CyberiaFriendship`: one friendship or friend request between two accounts.
 *
 * One document per pair: `low` and `high` are the two account ids in sort order. A request keeps
 * `expiresAt` and the TTL index removes it when nobody answers; an accepted friendship has none.
 *
 * @module src/api/cyberia-friendship/cyberia-friendship.model.js
 */

import { Schema, model } from 'mongoose';

const FRIENDSHIP_STATUSES = Object.freeze(['pending', 'accepted']);

const CyberiaFriendshipSchema = new Schema(
  {
    low: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    high: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: 'pending' },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, expires: 0 },
  },
  { timestamps: true },
);

CyberiaFriendshipSchema.index({ low: 1, high: 1 }, { unique: true });
// The friend list of an account reads both sides of the pair.
CyberiaFriendshipSchema.index({ low: 1, status: 1 });
CyberiaFriendshipSchema.index({ high: 1, status: 1 });

const CyberiaFriendshipModel = model('CyberiaFriendship', CyberiaFriendshipSchema);

const ProviderSchema = CyberiaFriendshipSchema;

export { CyberiaFriendshipSchema, CyberiaFriendshipModel, ProviderSchema, FRIENDSHIP_STATUSES };
