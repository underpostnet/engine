import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CompanySchema = new Schema({
  id: { type: String },
  name: { type: String, required: true },
  industry: { type: String, enum: ['tech', 'finance', 'healthcare'] },
  type: { type: String, enum: ['public', 'private', 'limited'] },
  founded: { type: Date },
  description: { type: String },
  logo: { type: Schema.Types.ObjectId, ref: 'File' },
  website: [{ type: String }],
  address: [{ type: String }],
  phone: [{ type: String }],
  email: [{ type: String }],
});

const CompanyModel = model('Company', CompanySchema);

const ProviderSchema = CompanySchema;

export { CompanySchema, CompanyModel, ProviderSchema };
