import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    location: { type: String },
    title: { type: String },
    tags: [{ type: String }],
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
    mdFileId: {
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
    file: () => {
      return {
        path: 'fileId',
        model: 'File',
        select: '_id name mimetype',
      };
    },
    user: () => {
      return {
        path: 'userId',
        model: 'User',
        select: '_id email username',
      };
    },
  },
};

export { DocumentSchema, DocumentModel, ProviderSchema, DocumentDto };
