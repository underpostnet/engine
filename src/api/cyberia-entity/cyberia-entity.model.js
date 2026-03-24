import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaEntitySchema = new Schema({});

const CyberiaEntityModel = model('CyberiaEntity', CyberiaEntitySchema);

const ProviderSchema = CyberiaEntitySchema;

export { CyberiaEntitySchema, CyberiaEntityModel, ProviderSchema };
