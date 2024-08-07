import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const BotSchema = new Schema({});

const BotModel = model('Bot', BotSchema);

const ProviderSchema = BotSchema;

export { BotSchema, BotModel, ProviderSchema };
