import { Schema, model, Types } from 'mongoose';
import { CyberiaEntitySchema } from '../cyberia-entity/cyberia-entity.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaMapSchema = new Schema(
  {
    code: { type: String, default: '' },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    entities: { type: [CyberiaEntitySchema], default: [] },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },
  },
  {
    timestamps: true,
  },
);

const CyberiaMapModel = model('CyberiaMap', CyberiaMapSchema);

const ProviderSchema = CyberiaMapSchema;

export { CyberiaMapSchema, CyberiaMapModel, ProviderSchema };
