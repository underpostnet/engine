import { Schema, model } from 'mongoose';

const FileSchema = new Schema({
  name: { type: String },
  data: { type: Buffer },
  size: { type: Number },
  encoding: { type: String },
  tempFilePath: { type: String },
  truncated: { type: Boolean },
  mimetype: { type: String },
  md5: { type: String },
  cid: { type: String },
});

const FileModel = model('File', FileSchema);

const ProviderSchema = FileSchema;

export { FileSchema, FileModel, ProviderSchema };
