/**
 * Mongoose model for the ItemLedgerBalance API: the balance one address holds of one token
 * type, projected from indexed transfers. The chain's `balanceOf` is the source of truth.
 *
 * @module src/api/item-ledger-balance/item-ledger-balance.model.js
 * @namespace ItemLedgerBalanceModel
 */
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} ItemLedgerBalance
 * @property {number} chainId
 * @property {string} contractAddress - Lower-case hex
 * @property {string} tokenId - Decimal uint256
 * @property {string} ownerAddress - Lower-case hex
 * @property {string} balance - Decimal uint256
 * @memberof ItemLedgerBalanceModel
 */
const ItemLedgerBalanceSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true, lowercase: true, trim: true },
    tokenId: { type: String, required: true, trim: true },
    ownerAddress: { type: String, required: true, lowercase: true, trim: true },
    balance: { type: String, required: true, default: '0', trim: true },
  },
  { timestamps: true },
);

ItemLedgerBalanceSchema.index({ chainId: 1, contractAddress: 1, tokenId: 1, ownerAddress: 1 }, { unique: true });
ItemLedgerBalanceSchema.index({ chainId: 1, contractAddress: 1, ownerAddress: 1 });

/**
 * Adds a signed amount to one holder's balance of one token type.
 * @param {{chainId:number,contractAddress:string,tokenId:string,ownerAddress:string}} key
 * @param {bigint} delta
 * @param {import('mongoose').ClientSession|null} [session=null]
 * @returns {Promise<string>} The new balance, decimal.
 * @memberof ItemLedgerBalanceModel
 */
ItemLedgerBalanceSchema.statics.add = async function (key, delta, session = null) {
  const current = await this.findOne(key, { balance: 1 }, { session }).lean();
  const balance = (BigInt(current?.balance ?? 0) + delta).toString(10);
  await this.updateOne(key, { $set: { balance }, $setOnInsert: key }, { upsert: true, session });
  return balance;
};

const ItemLedgerBalanceModel = model('ItemLedgerBalance', ItemLedgerBalanceSchema);
const ProviderSchema = ItemLedgerBalanceSchema;

class ItemLedgerBalanceDto {
  static select = {
    get: () => ({ _id: 1, chainId: 1, contractAddress: 1, tokenId: 1, ownerAddress: 1, balance: 1, updatedAt: 1 }),
  };
}

export { ItemLedgerBalanceSchema, ItemLedgerBalanceModel, ProviderSchema, ItemLedgerBalanceDto };
