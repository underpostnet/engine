import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaInstanceConfSchema = new Schema(
  {
    0: { type: String },
    1: { type: String },
    2: { type: String },
  },
  {
    timestamps: true,
  },
);

const CyberiaInstanceConfModel = model('CyberiaInstanceConf', CyberiaInstanceConfSchema);

const ProviderSchema = CyberiaInstanceConfSchema;

export { CyberiaInstanceConfSchema, CyberiaInstanceConfModel, ProviderSchema };
