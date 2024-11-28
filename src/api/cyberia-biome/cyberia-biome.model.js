import { Schema, model } from 'mongoose';

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
      x: { type: Number },
      y: { type: Number },
    },
  ],
  transports: [
    {
      path: { type: String },
      x: { type: Number },
      y: { type: Number },
      dim: { type: Number, default: 1 },
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
