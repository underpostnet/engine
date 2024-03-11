import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const BucketSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  files: [
    {
      location: { type: String },
      fileId: {
        type: Schema.Types.ObjectId,
        ref: 'File',
      },
    },
  ],
});

const BucketModel = model('Bucket', BucketSchema);

export { BucketSchema, BucketModel };
