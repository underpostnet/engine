import { Schema, model } from 'mongoose';
import { ResourcesComponentCyberia } from '../../client/components/cyberia/CommonCyberia.js';

const CyberiaBiomeSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
  topLevelColorFileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
  solid: [[{ type: Number }]],
  color: [[{ type: String }]],
  topLevelColor: [[{ type: String }]],
  name: { type: String },
  biome: { type: String },
  dim: { type: Number },
  dimPaintByCell: { type: Number },
  dimAmplitude: { type: Number },
  resources: [
    {
      id: { type: String },
      type: { type: String, enum: Object.keys(ResourcesComponentCyberia) },
      x: { type: Number },
      y: { type: Number },
    },
  ],
});

const CyberiaBiomeModel = model('CyberiaBiome', CyberiaBiomeSchema);

const ProviderSchema = CyberiaBiomeSchema;

const CyberiaBiomeDto = {
  select: {
    get: () => {
      return {
        _id: 1,
        name: 1,
        biome: 1,
        fileId: 1,
        topLevelColorFileId: 1,
        dim: 1,
        dimAmplitude: 1,
        dimPaintByCell: 1,
      };
    },
  },
};

export { CyberiaBiomeSchema, CyberiaBiomeModel, ProviderSchema, CyberiaBiomeDto };
