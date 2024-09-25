import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    location: { type: String },
    tags: [{ type: String }],
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
    imageFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
  },
  {
    timestamps: true,
  },
);

const DocumentModel = model('Document', DocumentSchema);

const ProviderSchema = DocumentSchema;

const DocumentDto = {
  populate: {
    get: () => {
      return {
        path: 'fileId',
        model: 'File',
        select: '_id name mimetype',
      };
    },
  },
};

export { DocumentSchema, DocumentModel, ProviderSchema, DocumentDto };
