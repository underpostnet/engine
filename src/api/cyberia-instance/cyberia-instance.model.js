import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaInstanceSchema = new Schema(
  {
    0: { type: String },
    1: { type: String },
    2: { type: String },
  },
  {
    timestamps: true,
  },
);

const CyberiaInstanceModel = model('CyberiaInstance', CyberiaInstanceSchema);

const ProviderSchema = CyberiaInstanceSchema;

export { CyberiaInstanceSchema, CyberiaInstanceModel, ProviderSchema };
