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
  ipfsCid: { type: String, unique: true },
});

const FileModel = model('File', FileSchema);

export { FileSchema, FileModel };
