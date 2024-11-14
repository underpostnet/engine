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
  type: { type: String, enum: ['custom', 'item-skin-08', 'item-skin-06'], default: 'custom' },
});

const CyberiaTileModel = model('CyberiaTile', CyberiaTileSchema);

const ProviderSchema = CyberiaTileSchema;

const CyberiaTileDto = {
  select: {
    get: () => {
      return { _id: 1, name: 1, fileId: 1 };
    },
  },
};

export { CyberiaTileSchema, CyberiaTileModel, ProviderSchema, CyberiaTileDto };
