/**
 * Mongoose model for `CyberiaWorldDrop`: one stack an account player dropped in a world, from the
 * commit that took it from the profile until a player claims it or it expires.
 *
 * The drop operation creates the record in the transaction that writes the profile of its owner. A
 * pickup operation claims it in the transaction that writes the profile of the collector: only a
 * public record that has not expired, once. A record leaves `WORLD_DROP_RECORD_DAYS` after it
 * expires.
 *
 * @module src/api/cyberia-world-drop/cyberia-world-drop.model.js
 */

import { Schema, model } from 'mongoose';

/** A public record waits on the ground; a claimed one is in the profile of its collector. */
const WORLD_DROP_STATUSES = Object.freeze(['public', 'claimed']);

/** Days a record stays readable after it expires. */
const WORLD_DROP_RECORD_DAYS = 7;

/** The longest lifetime a drop may ask for. */
const WORLD_DROP_MAX_LIFETIME_MS = 86400000;

const CyberiaWorldDropSchema = new Schema(
  {
    // The id of the drop operation that created it.
    dropId: { type: String, required: true, unique: true, trim: true },
    instanceCode: { type: String, required: true },
    mapCode: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    itemId: { type: String, required: true },
    olCid: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    owner: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true },
    status: { type: String, enum: WORLD_DROP_STATUSES, default: 'public' },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', default: null },
    claimedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

CyberiaWorldDropSchema.index({ instanceCode: 1, status: 1, expiresAt: 1 });
CyberiaWorldDropSchema.index({ expiresAt: 1 }, { expireAfterSeconds: WORLD_DROP_RECORD_DAYS * 86400 });

const CyberiaWorldDropModel = model('CyberiaWorldDrop', CyberiaWorldDropSchema);

const ProviderSchema = CyberiaWorldDropSchema;

export {
  CyberiaWorldDropSchema,
  CyberiaWorldDropModel,
  ProviderSchema,
  WORLD_DROP_STATUSES,
  WORLD_DROP_RECORD_DAYS,
  WORLD_DROP_MAX_LIFETIME_MS,
};
