/**
 * @module crypto.test
 * @description Unit tests for SymmetricCrypto and AsymmetricCrypto classes
 * in the crypto module.
 * * Uses 'chai' for assertions.
 */

// Import Chai's assertion library
import { expect } from 'chai';

// Import the cryptographic classes from the Canvas's refactored module
import { SymmetricCrypto, AsymmetricCrypto } from '../src/server/crypto.js';

// Define a common plaintext message for testing
const plaintext = 'This is a secret message for testing cryptographic operations.';

// --- Main Test Suite ---

describe('Crypto Module Tests', () => {
  // --- SymmetricCrypto Tests (AES-256-CBC) ---
  describe('SymmetricCrypto (AES-256-CBC)', () => {
    /**
     * Test case: Verify that key and IV are automatically generated.
     */
    it('should generate new 32-byte key and 16-byte IV if none are provided', () => {
      const symm = new SymmetricCrypto();
      // Key should be 32 bytes (64 hex characters) and IV 16 bytes (32 hex characters)
      expect(symm.encryptionKeyHex).to.be.a('string').and.have.lengthOf(64);
      expect(symm.ivHex).to.be.a('string').and.have.lengthOf(32);
    });

    /**
     * Test case: Encrypt data and ensure successful decryption back to the original plaintext.
     */
    it('should encrypt and successfully decrypt data', () => {
      const symm = new SymmetricCrypto();
      const ciphertext = symm.encryptData(plaintext);

      // Ciphertext should contain IV and the encrypted data, separated by a colon
      expect(ciphertext).to.include(':');

      const decryptedText = symm.decryptData(ciphertext);
      expect(decryptedText).to.equal(plaintext);
    });

    /**
     * Test case: Verify that decryption fails gracefully if the ciphertext is tampered with (e.g., corrupting the encrypted payload).
     *
     * FIX: We now reliably tamper with the encrypted hex string by removing the last character.
     * This ensures the underlying crypto operation fails due to invalid hex length or incomplete data,
     * guaranteeing the try/catch block in the implementation is hit, and the expected error is thrown.
     */
    it('should fail decryption gracefully for tampered ciphertext (invalid payload)', () => {
      const symm = new SymmetricCrypto();
      const ciphertext = symm.encryptData(plaintext);

      const [ivHex, encryptedHex] = ciphertext.split(':');

      // Tamper with the encrypted content by cutting off the last character.
      const tamperedEncryptedHex = encryptedHex.substring(0, encryptedHex.length - 1);

      const tamperedCiphertext = `${ivHex}:${tamperedEncryptedHex}`;

      // Expect the internal error handling to throw the generic error message
      expect(() => symm.decryptData(tamperedCiphertext)).to.throw(
        Error,
        'Decryption failed. Check key, IV, or ciphertext integrity.',
      );
    });
  });

  // --- AsymmetricCrypto Tests (RSA 2048) ---
  describe('AsymmetricCrypto (RSA 2048)', () => {
    /**
     * Test case: Verify that RSA key pair is automatically generated.
     */
    it('should generate a new RSA key pair if none are provided', () => {
      const asymm = new AsymmetricCrypto();
      // Public and Private keys should be PEM strings
      expect(asymm.publicKey).to.be.a('string').and.include('BEGIN PUBLIC KEY');
      expect(asymm.privateKey).to.be.a('string').and.include('BEGIN PRIVATE KEY');
    });

    /**
     * Test case: Encrypt with public key and decrypt with the corresponding private key.
     */
    it('should encrypt data with public key and decrypt with private key', () => {
      const asymm = new AsymmetricCrypto();
      const ciphertext = asymm.encryptData(plaintext);

      // Ciphertext is a hex string
      expect(ciphertext).to.be.a('string');

      const decryptedText = asymm.decryptData(ciphertext);
      expect(decryptedText).to.equal(plaintext);
    });

    /**
     * Test case: Verify that decryption fails gracefully when using a mismatched private key.
     */
    it('should fail decryption gracefully when using the wrong private key', () => {
      // 1. Generate the key pair and encrypt the data
      const asymm1 = new AsymmetricCrypto();
      const ciphertext = asymm1.encryptData(plaintext);

      // 2. Generate a completely different key pair (wrong key)
      const asymm2 = new AsymmetricCrypto();

      // 3. Try to decrypt ciphertext from asymm1 using the private key from asymm2
      // The implementation will log the 'oaep decoding error' and re-throw the generic message.
      expect(() => asymm2.decryptData(ciphertext)).to.throw(
        Error,
        'Decryption failed. Check private key or ciphertext integrity.',
      );
    });
  });
});
