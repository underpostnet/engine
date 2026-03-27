import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaInstanceSchema = new Schema(
  {
    code: { type: String, default: '' },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    cyberiaMapCodes: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },
  },
  {
    timestamps: true,
  },
);

const CyberiaInstanceModel = model('CyberiaInstance', CyberiaInstanceSchema);

const ProviderSchema = CyberiaInstanceSchema;

export { CyberiaInstanceSchema, CyberiaInstanceModel, ProviderSchema };
