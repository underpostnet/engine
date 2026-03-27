import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaEntitySchema = new Schema({
  entityType: { type: String, default: 'floor' },
  initCellX: { type: Number, default: 0 },
  initCellY: { type: Number, default: 0 },
  dimX: { type: Number, default: 1 },
  dimY: { type: Number, default: 1 },
  color: { type: String, default: 'rgba(255, 0, 0, 1)' },
  objectLayerItemIds: { type: [String], default: [] },
});

const CyberiaEntityModel = model('CyberiaEntity', CyberiaEntitySchema);

const ProviderSchema = CyberiaEntitySchema;

export { CyberiaEntitySchema, CyberiaEntityModel, ProviderSchema };
