import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const PinSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  cid: { type: String },
});

const PinModel = model('Pin', PinSchema);

const ProviderSchema = PinSchema;

export { PinSchema, PinModel, ProviderSchema };
