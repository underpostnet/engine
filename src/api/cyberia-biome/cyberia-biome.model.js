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
  dim: { type: Number, default: 16 * 2 },
  dimPaintByCell: { type: Number, default: 3 },
  dimAmplitude: { type: Number, default: 3 },
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
      x1: { type: Number },
      y1: { type: Number },
      x2: { type: Number },
      y2: { type: Number },
      face: { type: Number },
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
        resources: 1,
        transports: 1,
      };
    },
  },
};

export { CyberiaBiomeSchema, CyberiaBiomeModel, ProviderSchema, CyberiaBiomeDto };
