// Optional embedded self-custodial wallet. The key is generated in the browser, never leaves
// it, and is encrypted before it is stored.
//
// Threat model: the vault protects the secret at rest against someone reading browser storage
// without the passphrase. It does not protect against a compromised page, a malicious
// extension or a keylogger, because the decrypted key lives in page memory while unlocked.
// This is weaker than a hardware wallet and is documented as such in the UI.
//
// Derivation: BIP-39 mnemonic → BIP-32 → BIP-44 Ethereum account, default `m/44'/60'/0'/0/0`.
// Signing and derivation use the audited ethers primitives; nothing here implements secp256k1.
import { HDNodeWallet, Mnemonic, Wallet, getAddress } from 'ethers';
import { WALLET_CAPABILITIES, WALLET_TYPES } from './WalletProvider.js';

/** BIP-44 Ethereum baseline. An account index selects another path on the same tree. */
export const ETHEREUM_BASE_PATH = "m/44'/60'/0'/0";

/** Path of one account index under the Ethereum baseline. */
export const accountPath = (index = 0) => `${ETHEREUM_BASE_PATH}/${Number(index)}`;

/** Where the encrypted vault lives. Browser storage, one record. */
const VAULT_DB = 'cyberia-wallet';
const VAULT_STORE = 'vault';
const VAULT_KEY = 'embedded';

const openVaultDb = (indexedDB = globalThis.indexedDB) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(VAULT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const vaultTransaction = (db, mode, run) =>
  new Promise((resolve, reject) => {
    const store = db.transaction(VAULT_STORE, mode).objectStore(VAULT_STORE);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Reads, writes and clears the encrypted vault record.
 * @memberof EmbeddedWallet
 */
export const VaultStorage = {
  async read(indexedDB) {
    const db = await openVaultDb(indexedDB);
    return await vaultTransaction(db, 'readonly', (store) => store.get(VAULT_KEY));
  },
  async write(record, indexedDB) {
    const db = await openVaultDb(indexedDB);
    await vaultTransaction(db, 'readwrite', (store) => store.put(record, VAULT_KEY));
  },
  async clear(indexedDB) {
    const db = await openVaultDb(indexedDB);
    await vaultTransaction(db, 'readwrite', (store) => store.delete(VAULT_KEY));
  },
};

/**
 * An embedded account: the key stays here, the vault holds it encrypted, and the provider
 * interface is the same one an external wallet answers.
 *
 * @class
 */
class EmbeddedWallet {
  /** The unlocked signer, or null. Cleared by {@link EmbeddedWallet.lock}. */
  static signer = null;
  /** Storage the vault uses; replaceable in tests. */
  static storage = VaultStorage;

  /**
   * Creates an account from a new random mnemonic. The caller shows the phrase once and
   * verifies the backup before the account is used.
   * @param {Object} [params]
   * @param {number} [params.accountIndex=0]
   * @returns {{mnemonic:string,address:string,path:string}}
   */
  static create({ accountIndex = 0 } = {}) {
    const wallet = HDNodeWallet.createRandom(undefined, accountPath(accountIndex));
    return { mnemonic: wallet.mnemonic.phrase, address: wallet.address, path: wallet.path };
  }

  /**
   * Restores an account from a mnemonic. Deterministic: one phrase and index always give one
   * address.
   * @param {Object} params
   * @param {string} params.mnemonic - BIP-39 phrase.
   * @param {number} [params.accountIndex=0]
   * @returns {{address:string,path:string}}
   */
  static restore({ mnemonic, accountIndex = 0 }) {
    if (!Mnemonic.isValidMnemonic(mnemonic)) throw new Error('The recovery phrase is not a valid BIP-39 mnemonic');
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, accountPath(accountIndex));
    return { address: wallet.address, path: wallet.path };
  }

  /**
   * Encrypts the account and stores it. The passphrase never leaves the browser and is not
   * stored; losing it means restoring from the mnemonic.
   * @param {Object} params
   * @param {string} params.mnemonic
   * @param {string} params.passphrase
   * @param {number} [params.accountIndex=0]
   * @param {Object} [params.indexedDB]
   * @returns {Promise<{address:string,path:string}>}
   */
  static async save({ mnemonic, passphrase, accountIndex = 0, indexedDB }) {
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, accountPath(accountIndex));
    // Web3 Secret Storage: the interoperable encrypted keystore, for export and import.
    const keystore = await wallet.encrypt(passphrase);
    await EmbeddedWallet.storage.write(
      { keystore, address: wallet.address, path: wallet.path, createdAt: new Date().toISOString() },
      indexedDB,
    );
    return { address: wallet.address, path: wallet.path };
  }

  /** The stored account, without unlocking it. */
  static async account(indexedDB) {
    const record = await EmbeddedWallet.storage.read(indexedDB);
    return record ? { address: record.address, path: record.path, createdAt: record.createdAt } : null;
  }

  /**
   * Decrypts the vault into memory. Signing needs an unlocked wallet.
   * @param {Object} params
   * @param {string} params.passphrase
   * @param {Object} [params.indexedDB]
   * @returns {Promise<string>} The unlocked address.
   */
  static async unlock({ passphrase, indexedDB }) {
    const record = await EmbeddedWallet.storage.read(indexedDB);
    if (!record) throw new Error('No embedded wallet is stored in this browser');
    EmbeddedWallet.signer = await Wallet.fromEncryptedJson(record.keystore, passphrase);
    return EmbeddedWallet.signer.address;
  }

  /** Drops the decrypted key from memory. */
  static lock() {
    EmbeddedWallet.signer = null;
  }

  /** The encrypted keystore, for an interoperable backup. Never the plain key. */
  static async exportKeystore(indexedDB) {
    const record = await EmbeddedWallet.storage.read(indexedDB);
    if (!record) throw new Error('No embedded wallet is stored in this browser');
    return record.keystore;
  }

  /** Stores an account from an interoperable encrypted keystore. */
  static async importKeystore({ keystore, passphrase, indexedDB }) {
    const wallet = await Wallet.fromEncryptedJson(keystore, passphrase);
    await EmbeddedWallet.storage.write(
      { keystore, address: wallet.address, path: wallet.path ?? accountPath(0), createdAt: new Date().toISOString() },
      indexedDB,
    );
    return { address: wallet.address };
  }

  /** Removes the vault record. The mnemonic is the only way back. */
  static async forget(indexedDB) {
    EmbeddedWallet.lock();
    await EmbeddedWallet.storage.clear(indexedDB);
  }

  /**
   * The provider interface over the unlocked account.
   * @param {Object} [params]
   * @param {number} [params.chainId=0] - Chain the account acts on.
   * @returns {import('./WalletProvider.js').WalletProvider}
   */
  static provider({ chainId = 0 } = {}) {
    const signer = () => {
      if (!EmbeddedWallet.signer) throw new Error('The embedded wallet is locked');
      return EmbeddedWallet.signer;
    };
    return {
      id: 'embedded',
      name: 'Cyberia wallet',
      type: WALLET_TYPES.embedded,
      capabilities: Object.freeze([
        WALLET_CAPABILITIES.signMessage,
        WALLET_CAPABILITIES.signTypedData,
        WALLET_CAPABILITIES.export,
        WALLET_CAPABILITIES.lock,
      ]),
      getAddress: async () => getAddress(signer().address),
      getChainId: async () => chainId,
      signMessage: async (message) => await signer().signMessage(message),
      signTypedData: async ({ domain, types, message }) => {
        const { EIP712Domain, ...signedTypes } = types;
        return await signer().signTypedData(domain, signedTypes, message);
      },
    };
  }
}

export { EmbeddedWallet };
