import { Schema, model } from 'mongoose';

const CyberiaBiomeSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
  solid: [[{ type: Number }]],
  color: [[{ type: String }]],
});

const CyberiaBiomeModel = model('CyberiaBiome', CyberiaBiomeSchema);

export { CyberiaBiomeSchema, CyberiaBiomeModel };
