import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DefaultSchema = new Schema(
  {
    0: { type: String },
    1: { type: String },
    2: { type: String },
  },
  {
    timestamps: true,
  },
);

const DefaultModel = model('Default', DefaultSchema);

const ProviderSchema = DefaultSchema;

export { DefaultSchema, DefaultModel, ProviderSchema };
