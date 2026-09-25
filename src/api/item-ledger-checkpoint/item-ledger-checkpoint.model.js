/**
 * Mongoose model for the ItemLedgerCheckpoint API: the last block the indexer took into the
 * projection of one contract, so a restart resumes where it stopped.
 *
 * @module src/api/item-ledger-checkpoint/item-ledger-checkpoint.model.js
 * @namespace ItemLedgerCheckpointModel
 */
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} ItemLedgerCheckpoint
 * @property {number} chainId
 * @property {string} contractAddress - Lower-case hex
 * @property {number} lastBlock - Last block fully projected
 * @memberof ItemLedgerCheckpointModel
 */
const ItemLedgerCheckpointSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true, lowercase: true, trim: true },
    lastBlock: { type: Number, required: true, min: -1 },
  },
  { timestamps: true },
);

ItemLedgerCheckpointSchema.index({ chainId: 1, contractAddress: 1 }, { unique: true });

const ItemLedgerCheckpointModel = model('ItemLedgerCheckpoint', ItemLedgerCheckpointSchema);
const ProviderSchema = ItemLedgerCheckpointSchema;

class ItemLedgerCheckpointDto {
  static select = { get: () => ({ _id: 1, chainId: 1, contractAddress: 1, lastBlock: 1, updatedAt: 1 }) };
}

export { ItemLedgerCheckpointSchema, ItemLedgerCheckpointModel, ProviderSchema, ItemLedgerCheckpointDto };
