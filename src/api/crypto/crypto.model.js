import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CryptoSchema = new Schema({});

const CryptoModel = model('Crypto', CryptoSchema);

export { CryptoSchema, CryptoModel };
