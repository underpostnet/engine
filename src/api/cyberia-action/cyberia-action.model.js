import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {},
  {
    timestamps: true,
  },
);

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
