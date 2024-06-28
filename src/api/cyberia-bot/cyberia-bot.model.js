import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaBotSchema = new Schema({});

const CyberiaBotModel = model('CyberiaBot', CyberiaBotSchema);

const ProviderSchema = CyberiaBotSchema;

export { CyberiaBotSchema, CyberiaBotModel, ProviderSchema };
