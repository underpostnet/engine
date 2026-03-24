import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaMapSchema = new Schema({});

const CyberiaMapModel = model('CyberiaMap', CyberiaMapSchema);

const ProviderSchema = CyberiaMapSchema;

export { CyberiaMapSchema, CyberiaMapModel, ProviderSchema };
