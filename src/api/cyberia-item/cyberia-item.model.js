import { Schema, model, Types } from 'mongoose';
import { BehaviorElement, CyberiaItemsType } from '../../client/components/cyberia/CommonCyberia.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// All cyberia items associated with a public key can fully reconstruct a character's game state.

const DisplaySchema = new Schema({
  displayId: { type: String },
  current: { type: Boolean },
  enabled: { type: Boolean },
  position: { type: String },
  positions: { type: [{ positionId: { type: String }, frames: { type: Number } }] },
  assetFolder: { type: String, default: 'skin' },
  extension: { type: String, default: 'png' },
  velFrame: { type: Number, default: 250 },
  apiPaths: [{ type: String }],
});

const CyberiaItemSchema = new Schema({
  data: {
    type: {
      itemType: { type: String, enum: Object.keys(CyberiaItemsType), required: true },
      dim: { type: Number },
      vel: { type: Number },
      maxLife: { type: Number },
      life: { type: Number },
      deadTime: { type: Number },
      timeLife: { type: Number },
      damage: { type: Number },
      heal: { type: Number },
      lifeRegeneration: { type: Number },
      lifeRegenerationVel: { type: Number },
      cooldown: { type: Number }, // ms
      cooldownIncubation: { type: Number }, // ms
      basePrice: { type: Number },
      behavior: { type: String, enum: Object.keys(BehaviorElement) },
      timestamp: { type: Number, required: true },
      id: { type: String, required: true },
    },
    immutable: true,
  },
  cid: { type: String, required: true, immutable: true }, // ipfs cid of JSON.stringify(item.data)
});

const CyberiaItemModel = model('CyberiaItem', CyberiaItemSchema);

const ProviderSchema = CyberiaItemSchema;

export { CyberiaItemSchema, CyberiaItemModel, ProviderSchema, DisplaySchema };
