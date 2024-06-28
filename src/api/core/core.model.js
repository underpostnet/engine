import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CoreSchema = new Schema({});

const CoreModel = model('Core', CoreSchema);

const ProviderSchema = CoreSchema;

export { CoreSchema, CoreModel, ProviderSchema };
