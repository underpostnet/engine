import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaTileSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
  solid: { type: Schema.Types.Mixed },
  color: [[{ type: String }]],
  name: { type: String },
  dim: { type: Number },
  dimPaintByCell: { type: Number },
});

const CyberiaTileModel = model('CyberiaTile', CyberiaTileSchema);

export { CyberiaTileSchema, CyberiaTileModel };
