import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const BucketSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  location: { type: String },
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
  },
});

const BucketModel = model('Bucket', BucketSchema);

const ProviderSchema = BucketSchema;

export { BucketSchema, BucketModel, ProviderSchema };
