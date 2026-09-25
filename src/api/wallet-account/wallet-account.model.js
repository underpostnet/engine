/**
 * Mongoose model for the WalletAccount API: the public metadata a domain keeps about a wallet
 * identity.
 *
 * A record names an account by CAIP-10 (`eip155:<chainId>:<address>`) and says how the user
 * holds it. It never holds signing material: no private key, no mnemonic, no seed, no
 * keystore. A schema path that could carry one is rejected at write time.
 *
 * @module src/api/wallet-account/wallet-account.model.js
 * @namespace WalletAccountModel
 */
import { Schema, model } from 'mongoose';

/** How the user holds the key. */
export const WALLET_TYPES = Object.freeze(['external', 'embedded', 'contract']);

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

/** Field names that would mean secret material reached this collection. */
const FORBIDDEN_FIELDS = Object.freeze([
  'privateKey',
  'mnemonic',
  'seed',
  'keystore',
  'secret',
  'jwk',
  'recoveryPhrase',
]);

/** Lower-case form every address is stored in. */
export const normalizeAddress = (address) =>
  String(address ?? '')
    .trim()
    .toLowerCase();

/** CAIP-10 account id of one address on one chain. */
export const caip10 = (chainId, address) => `eip155:${Number(chainId)}:${normalizeAddress(address)}`;

/**
 * @typedef {Object} WalletAccount
 * @property {string} accountId - CAIP-10 id, unique
 * @property {string} address - Lower-case hex
 * @property {string} chainNamespace - CAIP-2 namespace, `eip155`
 * @property {number} chainId - EIP-155 chain id the account signed in on
 * @property {string} walletType - external | embedded | contract
 * @property {string} providerType - Provider id (EIP-6963 rdns, or `embedded`)
 * @property {string} derivationPath - BIP-44 path of an embedded account
 * @property {Types.ObjectId} userId - The user this account is bound to
 * @property {Date} createdAt
 * @property {Date} lastSeenAt
 * @memberof WalletAccountModel
 */
const WalletAccountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, trim: true },
    address: { type: String, required: true, trim: true, lowercase: true, match: ADDRESS_PATTERN },
    chainNamespace: { type: String, required: true, default: 'eip155', enum: ['eip155'] },
    chainId: { type: Number, required: true, min: 1, validate: Number.isInteger },
    walletType: { type: String, required: true, enum: WALLET_TYPES },
    providerType: { type: String, default: '', trim: true },
    // Public derivation metadata of an embedded account. The key itself stays in the browser.
    derivationPath: { type: String, default: '', trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: 'throw' },
);

WalletAccountSchema.index({ address: 1 });
WalletAccountSchema.index({ userId: 1 });

// No signing material reaches this collection, whatever a writer sends.
WalletAccountSchema.pre('validate', function () {
  for (const field of FORBIDDEN_FIELDS) {
    if (this.get(field) !== undefined) throw new Error(`WalletAccount must never carry "${field}"`);
  }
});

/**
 * Records that an account signed in, creating it on first sight.
 * @param {Object} params - `{ chainId, address, walletType, providerType?, derivationPath?, userId? }`.
 * @returns {Promise<Object>} The stored account.
 * @memberof WalletAccountModel
 */
WalletAccountSchema.statics.touch = async function ({
  chainId,
  address,
  walletType,
  providerType = '',
  derivationPath = '',
  userId,
}) {
  const accountId = caip10(chainId, address);
  const $set = { lastSeenAt: new Date(), walletType, providerType, derivationPath };
  if (userId) $set.userId = userId;
  return await this.findOneAndUpdate(
    { accountId },
    {
      $set,
      $setOnInsert: {
        accountId,
        address: normalizeAddress(address),
        chainNamespace: 'eip155',
        chainId: Number(chainId),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  );
};

const WalletAccountModel = model('WalletAccount', WalletAccountSchema);
const ProviderSchema = WalletAccountSchema;

class WalletAccountDto {
  static select = {
    get: () => ({
      _id: 1,
      accountId: 1,
      address: 1,
      chainNamespace: 1,
      chainId: 1,
      walletType: 1,
      providerType: 1,
      derivationPath: 1,
      createdAt: 1,
      lastSeenAt: 1,
    }),
  };
}

export { WalletAccountSchema, WalletAccountModel, ProviderSchema, WalletAccountDto, FORBIDDEN_FIELDS };
