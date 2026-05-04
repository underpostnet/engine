import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaActionSchema = new Schema(
  {
    // Stable slug, e.g. "wason-quest-intro"
    code: { type: String, required: true, unique: true, trim: true },
    // craft | shop | storage | talk | quest
    type: {
      type: String,
      required: true,
      enum: ['craft', 'shop', 'storage', 'talk', 'quest'],
    },
    // Human-readable label shown in the overlay
    label: { type: String, required: true, trim: true },
    // Item id of the entity/object-layer node that provides this action.
    // When building the map, entities whose active object layer has a matching
    // item-type and item-id are linked to this action as local providers.
    provideItemId: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

CyberiaActionSchema.index({ code: 1 }, { unique: true });
CyberiaActionSchema.index({ provideItemId: 1 });

const CyberiaActionModel = model('CyberiaAction', CyberiaActionSchema);

const ProviderSchema = CyberiaActionSchema;

export { CyberiaActionSchema, CyberiaActionModel, ProviderSchema };
