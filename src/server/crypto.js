import crypto from 'crypto';
import fs from 'fs-extra';

const CryptoBuilder = {
  symmetric: {
    instance: function (options = { iv: '', encryptionKey: '' }) {
      // Generate a random 32-byte encryption key
      const encryptionKey = option?.encryptionKey ? options.encryptionKey : crypto.randomBytes(32);
      const iv = option?.iv ? options.iv : crypto.randomBytes(16); // Generate a new Initialization Vector (IV) for each encryption

      // Function to encrypt data
      function encryptData(plaintext = '') {
        const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
      }

      // Function to decrypt data
      function decryptData(ciphertext = '') {
        const [ivHex, encrypted] = ciphertext.split(':');
        const _iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, _iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }

      return {
        encryptionKey,
        iv,
        encryptData,
        decryptData,
      };
    },
  },
  asymmetric: {
    instance: function (
      options = {
        publicKey: '', // fs.readFileSync('./key.pem', 'utf8')
        privateKey: '', // fs.readFileSync('./key.pem', 'utf8')
      },
    ) {
      // Generate a new key pair
      const { privateKey, publicKey } = options
        ? options
        : crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048, // Key size in bits
            publicKeyEncoding: {
              type: 'spki',
              format: 'pem',
            },
            privateKeyEncoding: {
              type: 'pkcs8',
              format: 'pem',
            },
          });

      // Function to encrypt data
      function encryptData(plaintext) {
        const buffer = Buffer.from(plaintext, 'utf8');
        const encrypted = crypto.publicEncrypt(publicKey, buffer);
        return encrypted.toString('hex');
      }

      // Function to decrypt data
      function decryptData(ciphertext) {
        const buffer = Buffer.from(ciphertext, 'hex');
        const decrypted = crypto.privateDecrypt(privateKey, buffer);
        return decrypted.toString('utf8');
      }

      fs.writeFileSync('./public.pem', publicKey);
      fs.writeFileSync('./private.pem', privateKey);

      const result = {
        privateKey: fs.readFileSync('./public.pem', 'utf8'),
        publicKey: fs.readFileSync('./private.pem', 'utf8'),
        encryptData,
        decryptData,
      };

      fs.removeSync('./public.pem');
      fs.removeSync('./private.pem');

      return result;
    },
  },
};

export { CryptoBuilder };
