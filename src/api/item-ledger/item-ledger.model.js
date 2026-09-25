/**
 * Mongoose model for the ItemLedger API: the binding between a canonical Object Layer and
 * its on-chain token type.
 *
 * One record binds one `objectLayerCid` to one `chainId + contractAddress + tokenId`. The
 * token id is derived from the CID, so a definition registers at most once per contract.
 * `itemId` is a label copied for discovery: many bindings may carry the same one.
 * Ownership is a projection of chain balances and is read from the contract, not stored here.
 *
 * @module src/api/item-ledger/item-ledger.model.js
 * @namespace ItemLedgerModel
 */
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN, cidFromSha256Hex, sha256HexFromCid } from '../object-layer/object-layer.identity.js';

/** The one token standard the ledger binds to. */
const TOKEN_STANDARD = 'ERC1155';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const UINT256_PATTERN = /^(0|[1-9][0-9]*)$/;
const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Deterministic ERC-1155 token id of an Object Layer: `uint256(contentHash)`, the sha2-256
 * digest its CID carries. `ObjectLayerToken.computeTokenId(bytes32)` is the same cast.
 * @param {string} objectLayerCid - Canonical Object Layer CID.
 * @returns {string} Decimal uint256.
 * @memberof ItemLedgerModel
 */
export const objectLayerTokenId = (objectLayerCid) => BigInt(`0x${sha256HexFromCid(objectLayerCid)}`).toString(10);

/**
 * The canonical Object Layer CID a token id represents. Token id 0 is the currency.
 * @param {string|number|bigint} tokenId
 * @returns {string}
 * @memberof ItemLedgerModel
 */
export const objectLayerCidOfTokenId = (tokenId) =>
  cidFromSha256Hex(BigInt(normalizeTokenId(tokenId)).toString(16).padStart(64, '0'));

/**
 * Lower-case checksum-free form of an EVM address.
 * @param {string} address
 * @returns {string}
 * @memberof ItemLedgerModel
 */
export const normalizeAddress = (address) => String(address ?? '').trim().toLowerCase();

/**
 * Decimal form of a token id given as decimal or `0x` hex.
 * @param {string|number|bigint} tokenId
 * @returns {string}
 * @memberof ItemLedgerModel
 */
export const normalizeTokenId = (tokenId) => {
  const value = BigInt(typeof tokenId === 'string' ? tokenId.trim() : tokenId);
  if (value < 0n || value > UINT256_MAX) throw new RangeError('tokenId must fit in a uint256');
  return value.toString(10);
};

/**
 * The fully qualified on-chain asset identity.
 * @typedef {Object} TokenRef
 * @property {number} chainId
 * @property {string} contractAddress
 * @property {string} tokenId - Decimal uint256
 * @memberof ItemLedgerModel
 */

/**
 * An ownership record: a projection of one holder's balance of one token type.
 * @typedef {TokenRef & {ownerAddress:string,balance:string}} OwnershipRecord
 * @memberof ItemLedgerModel
 */

/**
 * Shapes a chain balance read as an ownership record.
 * @param {Object} params
 * @param {number} params.chainId
 * @param {string} params.contractAddress
 * @param {string|number|bigint} params.tokenId
 * @param {string} params.ownerAddress
 * @param {string|number|bigint} params.balance
 * @returns {OwnershipRecord}
 * @memberof ItemLedgerModel
 */
export const ownershipRecord = ({ chainId, contractAddress, tokenId, ownerAddress, balance }) => ({
  chainId: Number(chainId),
  contractAddress: normalizeAddress(contractAddress),
  tokenId: normalizeTokenId(tokenId),
  ownerAddress: normalizeAddress(ownerAddress),
  balance: BigInt(balance).toString(10),
});

/**
 * @typedef {Object} ItemLedgerBinding
 * @property {string} objectLayerCid - Canonical Object Layer CID the token type represents
 * @property {string} itemId - Semantic label of the bound definition, for discovery
 * @property {number} chainId - EVM chain id
 * @property {string} contractAddress - ObjectLayerToken contract, lower-case hex
 * @property {string} tokenId - ERC-1155 token id, decimal uint256
 * @property {string} standard - Token standard, always `ERC1155`
 * @property {string} txHash - Registration transaction hash, when known
 * @property {number} blockNumber - Registration block, when known
 * @property {Date} createdAt - When the binding was indexed
 * @property {Date} updatedAt - When the binding was last updated
 * @memberof ItemLedgerModel
 */
const ItemLedgerSchema = new Schema(
  {
    objectLayerCid: { type: String, required: true, trim: true, match: OBJECT_LAYER_CID_PATTERN },
    itemId: { type: String, default: '', trim: true },
    chainId: { type: Number, required: true, min: 1, validate: Number.isInteger },
    contractAddress: { type: String, required: true, trim: true, lowercase: true, match: ADDRESS_PATTERN },
    tokenId: { type: String, required: true, trim: true, match: UINT256_PATTERN },
    standard: { type: String, default: TOKEN_STANDARD, enum: [TOKEN_STANDARD] },
    txHash: { type: String, default: '', trim: true },
    blockNumber: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

ItemLedgerSchema.index({ chainId: 1, contractAddress: 1, tokenId: 1 }, { unique: true });
ItemLedgerSchema.index({ chainId: 1, contractAddress: 1, objectLayerCid: 1 }, { unique: true });
ItemLedgerSchema.index({ objectLayerCid: 1 });
ItemLedgerSchema.index({ itemId: 1 });

// The token id follows the CID: a binding that names another one is not this contract's.
ItemLedgerSchema.pre('validate', function () {
  if (this.objectLayerCid && this.tokenId !== objectLayerTokenId(this.objectLayerCid)) {
    this.invalidate('tokenId', `tokenId must be objectLayerTokenId(${this.objectLayerCid})`);
  }
});

/**
 * Registers or refreshes the binding of a definition on one contract.
 * @param {Object} binding - `{ objectLayerCid, chainId, contractAddress, itemId?, tokenId?, txHash?, blockNumber? }`.
 * @returns {Promise<Object>} The stored binding.
 * @memberof ItemLedgerModel
 */
ItemLedgerSchema.statics.bind = async function (binding) {
  const contractAddress = normalizeAddress(binding.contractAddress);
  const tokenId = objectLayerTokenId(binding.objectLayerCid);
  if (binding.tokenId !== undefined && normalizeTokenId(binding.tokenId) !== tokenId) {
    throw new Error(`tokenId ${binding.tokenId} is not the token id of ${binding.objectLayerCid}`);
  }
  const filter = { chainId: Number(binding.chainId), contractAddress, tokenId };
  const $set = { objectLayerCid: binding.objectLayerCid, standard: TOKEN_STANDARD };
  if (binding.itemId !== undefined) $set.itemId = binding.itemId;
  if (binding.txHash) $set.txHash = binding.txHash;
  if (binding.blockNumber !== undefined) $set.blockNumber = Number(binding.blockNumber);
  return await this.findOneAndUpdate(
    filter,
    { $set, $setOnInsert: filter },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  );
};

/**
 * Every binding of one Object Layer, across chains and contracts.
 * @param {string} objectLayerCid
 * @returns {import('mongoose').Query}
 * @memberof ItemLedgerModel
 */
ItemLedgerSchema.statics.findByCid = function (objectLayerCid) {
  return this.find({ objectLayerCid }).sort({ chainId: 1, contractAddress: 1 });
};

/**
 * The binding of one on-chain token type, or null.
 * @param {TokenRef} ref
 * @returns {import('mongoose').Query}
 * @memberof ItemLedgerModel
 */
ItemLedgerSchema.statics.findByToken = function ({ chainId, contractAddress, tokenId }) {
  return this.findOne({
    chainId: Number(chainId),
    contractAddress: normalizeAddress(contractAddress),
    tokenId: normalizeTokenId(tokenId),
  });
};

const ItemLedgerModel = model('ItemLedger', ItemLedgerSchema);
const ProviderSchema = ItemLedgerSchema;

class ItemLedgerDto {
  static select = {
    get: () => ({
      _id: 1,
      objectLayerCid: 1,
      itemId: 1,
      chainId: 1,
      contractAddress: 1,
      tokenId: 1,
      standard: 1,
      txHash: 1,
      blockNumber: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

export { ItemLedgerSchema, ItemLedgerModel, ProviderSchema, ItemLedgerDto, TOKEN_STANDARD };
