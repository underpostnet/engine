/**
 * Module for managing crypto operations
 * @module src/server/crypto.js
 * @namespace Crypto
 */

import crypto from 'crypto';

/* ----------------------------- SymmetricCrypto ----------------------------- */

class SymmetricCrypto {
  #encryptionKey;

  /**
   * @param {object} [options]
   * @param {Buffer | string} [options.encryptionKey] - 32-byte key as Buffer or hex string. If not provided, a new random key is generated.
   */
  /** @memberof Crypto */
  constructor(options = {}) {
    const { encryptionKey } = options;

    if (encryptionKey) {
      this.#encryptionKey = typeof encryptionKey === 'string' ? Buffer.from(encryptionKey, 'hex') : encryptionKey;
    } else {
      this.#encryptionKey = crypto.randomBytes(32);
    }

    if (!Buffer.isBuffer(this.#encryptionKey) || this.#encryptionKey.length !== 32) {
      throw new Error('Encryption key must be a 32-byte Buffer or 64-length hex string.');
    }

    // Provide a compatibility IV property expected by some test suites / legacy code.
    // This IV is not reused for each encryption operation (encryptData will generate its own IV).
    // It exists so tests that expect an ivHex on the instance (16 bytes) continue to work.
    this.ivHex = crypto.randomBytes(16).toString('hex'); // 16 bytes -> 32 hex chars
  }

  /** Returns encryption key as hex. */
  /** @memberof Crypto */
  get encryptionKeyHex() {
    return this.#encryptionKey.toString('hex');
  }

  /**
   * Encrypts plaintext using AES-256-GCM and returns `iv_hex:ciphertext_hex:authTag_hex`.
   *
   * @param {string} [plaintext='']
   * @returns {string}
   * @memberof Crypto
   */
  encryptData(plaintext = '') {
    // GCM recommended IV size is 12 bytes
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.#encryptionKey, iv);

    const encryptedPart = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encryptedPart.toString('hex')}:${authTag.toString('hex')}`;
  }

  /**
   * Decrypts data. Supports two formats:
   *  - AES-256-GCM: `iv_hex:ciphertext_hex:authTag_hex` (preferred)
   *  - Legacy AES-256-CBC: `iv_hex:ciphertext_hex` (fallback for backward compatibility)
   *
   * @param {string} [ciphertext='']
   * @returns {string} plaintext
   * @throws {Error} Generic error on failure (to avoid leaking details).
   * @memberof Crypto
   */
  decryptData(ciphertext = '') {
    try {
      const parts = ciphertext.split(':');

      if (parts.length === 3) {
        // AES-256-GCM
        const [ivHex, encryptedHex, tagHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#encryptionKey, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
      }

      if (parts.length === 2) {
        // Legacy: AES-256-CBC (no authentication). Provided for compatibility only.
        const [ivHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = encryptedHex;

        const decipher = crypto.createDecipheriv('aes-256-cbc', this.#encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }

      throw new Error('Invalid ciphertext format.');
    } catch (err) {
      // Do not leak internal error details (stack, key material, etc.).
      // Optional: instrument monitoring/logging but avoid logging sensitive inputs.
      throw new Error('Decryption failed. Check key, IV, or ciphertext integrity.');
    }
  }
}

/* ---------------------------- AsymmetricCrypto ---------------------------- */

class AsymmetricCrypto {
  #publicKey;
  #privateKey;
  #modulusLength;

  /**
   * @param {object} [options]
   * @param {string|Buffer} [options.publicKey] - PEM-formatted public key
   * @param {string|Buffer} [options.privateKey] - PEM-formatted private key
   * @param {number} [options.modulusLength=2048] - If keys are not provided, generates a new key pair of this size (bits). Consider 3072 for long-lived keys.
   */
  /** @memberof Crypto */
  constructor(options = {}) {
    const { publicKey, privateKey } = options;
    this.#modulusLength = options.modulusLength || 2048;

    if (!publicKey || !privateKey) {
      // Generate an in-memory key pair. No file I/O; keys remain in process memory only.
      const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync('rsa', {
        modulusLength: this.#modulusLength,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.#publicKey = pub;
      this.#privateKey = priv;
    } else {
      // Accept provided keys (string or Buffer)
      this.#publicKey = typeof publicKey === 'string' || Buffer.isBuffer(publicKey) ? publicKey : String(publicKey);
      this.#privateKey =
        typeof privateKey === 'string' || Buffer.isBuffer(privateKey) ? privateKey : String(privateKey);

      // Basic validation: ensure PEM headers exist. This is intentionally lightweight.
      const pubStr = String(this.#publicKey);
      const privStr = String(this.#privateKey);
      if (!pubStr.includes('BEGIN PUBLIC KEY') || !privStr.includes('BEGIN')) {
        throw new Error('Provided keys do not appear to be valid PEM-formatted keys.');
      }
    }
  }

  /** @memberof Crypto */
  get publicKey() {
    return this.#publicKey;
  }

  /** @memberof Crypto */
  get privateKey() {
    return this.#privateKey;
  }

  /**
   * Encrypts plaintext using RSA-OAEP with SHA-256. Returns hex-encoded ciphertext.
   * Note: RSA encryption is intended for small payloads. For larger data use hybrid encryption (encrypt a symmetric key and then use AES-GCM).
   * @param {string} plaintext
   * @returns {string} hex ciphertext
   * @memberof Crypto
   */
  encryptData(plaintext) {
    const buffer = Buffer.from(plaintext, 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: this.#publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer,
    );

    return encrypted.toString('hex');
  }

  /**
   * Decrypts RSA-OAEP hex ciphertext and returns utf8 plaintext.
   * @param {string} ciphertextHex
   * @returns {string}
   * @memberof Crypto
   */
  decryptData(ciphertextHex) {
    try {
      const buffer = Buffer.from(ciphertextHex, 'hex');
      const decrypted = crypto.privateDecrypt(
        {
          key: this.#privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer,
      );

      return decrypted.toString('utf8');
    } catch (err) {
      // Avoid leaking details about keys or ciphertext
      throw new Error('Decryption failed. Check private key or ciphertext integrity.');
    }
  }
}

export { SymmetricCrypto, AsymmetricCrypto };
