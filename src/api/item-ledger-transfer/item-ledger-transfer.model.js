/**
 * Mongoose model for the ItemLedgerTransfer API: one row per ERC-1155 transfer event leg
 * (`TransferSingle`, or one id of a `TransferBatch`). Mints come from the zero address and
 * burns go to it. The chain is the source of truth; this is its indexed projection.
 *
 * @module src/api/item-ledger-transfer/item-ledger-transfer.model.js
 * @namespace ItemLedgerTransferModel
 */
import { Schema, model } from 'mongoose';

/** The address mints come from and burns go to. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * @typedef {Object} ItemLedgerTransfer
 * @property {number} chainId
 * @property {string} contractAddress - Lower-case hex
 * @property {string} tokenId - Decimal uint256
 * @property {string} from - Lower-case hex, the zero address for a mint
 * @property {string} to - Lower-case hex, the zero address for a burn
 * @property {string} value - Decimal uint256
 * @property {number} blockNumber
 * @property {string} txHash
 * @property {number} logIndex
 * @property {number} batchIndex - Position inside a `TransferBatch`, 0 for `TransferSingle`
 * @property {boolean} applied - Whether the balance projection took this leg
 * @memberof ItemLedgerTransferModel
 */
const ItemLedgerTransferSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true, lowercase: true, trim: true },
    tokenId: { type: String, required: true, trim: true },
    from: { type: String, required: true, lowercase: true, trim: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    value: { type: String, required: true, trim: true },
    blockNumber: { type: Number, required: true, min: 0 },
    txHash: { type: String, required: true, lowercase: true, trim: true },
    logIndex: { type: Number, required: true, min: 0 },
    batchIndex: { type: Number, required: true, min: 0 },
    applied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One row per event leg: a log replayed after a restart is not a second transfer.
ItemLedgerTransferSchema.index({ chainId: 1, contractAddress: 1, txHash: 1, logIndex: 1, batchIndex: 1 }, { unique: true });
ItemLedgerTransferSchema.index({ chainId: 1, contractAddress: 1, tokenId: 1, blockNumber: 1, logIndex: 1, batchIndex: 1 });
ItemLedgerTransferSchema.index({ chainId: 1, contractAddress: 1, applied: 1 });

const ItemLedgerTransferModel = model('ItemLedgerTransfer', ItemLedgerTransferSchema);
const ProviderSchema = ItemLedgerTransferSchema;

class ItemLedgerTransferDto {
  static select = {
    get: () => ({
      _id: 1,
      chainId: 1,
      contractAddress: 1,
      tokenId: 1,
      from: 1,
      to: 1,
      value: 1,
      blockNumber: 1,
      txHash: 1,
      logIndex: 1,
      batchIndex: 1,
    }),
  };
}

export { ItemLedgerTransferSchema, ItemLedgerTransferModel, ProviderSchema, ItemLedgerTransferDto };
