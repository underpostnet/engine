import { Schema, model } from 'mongoose';

const CyberiaBiomeSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
  solid: [[{ type: Number }]],
  color: [[{ type: String }]],
  name: { type: String },
  biome: { type: String },
  dim: { type: Number },
  dimPaintByCell: { type: Number },
  dimAmplitude: { type: Number },
});

const CyberiaBiomeModel = model('CyberiaBiome', CyberiaBiomeSchema);

export { CyberiaBiomeSchema, CyberiaBiomeModel };
