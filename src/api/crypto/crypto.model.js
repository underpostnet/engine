import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// Example:
// JWKS: Array of JWK
// https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets

const CryptoSchema = new Schema({
  format: { type: String, required: 'format is required' },
  data: { type: String, required: 'data is required', unique: true },
  algorithm: {
    name: { type: String, required: 'name is required' },
    namedCurve: { type: String, required: 'namedCurve is required' },
    hash: { type: String, required: 'hash is required' },
  },
});

const CryptoModel = model('Crypto', CryptoSchema);

const ProviderSchema = CryptoSchema;

export { CryptoSchema, CryptoModel, ProviderSchema };
