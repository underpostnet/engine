/**
 * Mongoose model for `CyberiaEconomyOperation`: the idempotency record of one joint commit: a trade
 * of several profiles, or one profile with its world drop or market operation.
 *
 * The commit writes the record in the transaction that writes the profiles. A retry with the same
 * `operationId` and `fingerprint` answers the first result; the same id with another fingerprint is
 * refused. A record expires after `OPERATION_RECORD_DAYS`: past that window no retry of the
 * operation can arrive, since its session sequences moved on.
 *
 * @module src/api/cyberia-economy-operation/cyberia-economy-operation.model.js
 */

import { Schema, model } from 'mongoose';

/** The operation kinds of a joint commit. */
const ECONOMY_OPERATION_KINDS = Object.freeze([
  'trade',
  'drop',
  'pickup',
  'market_list',
  'market_cancel',
  'market_buy',
  'market_bid',
  'market_collect',
]);

/** Days a record answers retries. */
const OPERATION_RECORD_DAYS = 7;

const CyberiaEconomyOperationSchema = new Schema(
  {
    operationId: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: ECONOMY_OPERATION_KINDS, required: true },
    instanceCode: { type: String, default: '' },
    // The profiles and the sequence each one committed at.
    players: { type: [{ type: Schema.Types.ObjectId, ref: 'CyberiaPlayer' }], default: [] },
    seqs: { type: [Number], default: [] },
    // sha256 of the request: the same id with another request is refused.
    fingerprint: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

CyberiaEconomyOperationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CyberiaEconomyOperationModel = model('CyberiaEconomyOperation', CyberiaEconomyOperationSchema);

const ProviderSchema = CyberiaEconomyOperationSchema;

export {
  CyberiaEconomyOperationSchema,
  CyberiaEconomyOperationModel,
  ProviderSchema,
  ECONOMY_OPERATION_KINDS,
  OPERATION_RECORD_DAYS,
};
