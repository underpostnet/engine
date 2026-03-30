import { Schema, model, Types } from 'mongoose';
import { CyberiaEntitySchema } from '../cyberia-entity/cyberia-entity.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaMapSchema = new Schema(
  {
    code: { type: String, default: '', unique: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    entities: { type: [CyberiaEntitySchema], default: [] },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },
    gridX: { type: Number, default: 16 },
    gridY: { type: Number, default: 16 },
    cellWidth: { type: Number, default: 32 },
    cellHeight: { type: Number, default: 32 },
  },
  {
    timestamps: true,
  },
);

const CyberiaMapModel = model('CyberiaMap', CyberiaMapSchema);

const ProviderSchema = CyberiaMapSchema;

export { CyberiaMapSchema, CyberiaMapModel, ProviderSchema };
