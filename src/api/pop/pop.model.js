import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const PopSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    components: {
      name: { type: String, required: true },
      id: { type: String },
      type: {
        type: String,
        enum: ['gate', 'maas', 'storage', 'rack', 'edge', 'guest', 'network', 'firewall', 'power', 'cooling'],
      },
    },
    operator: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const PopModel = model('Pop', PopSchema);

const ProviderSchema = PopSchema;

export { PopSchema, PopModel, ProviderSchema };
