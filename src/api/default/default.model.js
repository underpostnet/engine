import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DefaultSchema = new Schema({});

const DefaultModel = model('Default', DefaultSchema);

const ProviderSchema = DefaultSchema;

export { DefaultSchema, DefaultModel, ProviderSchema };
