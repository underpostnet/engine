import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const PopSchema = new Schema(
  {
    popId: {
      type: String,
      required: true,
      unique: true,
      trim: true, // SAP UUID | GUID
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    companyCode: {
      // SAP code
      type: String,
      required: true,
    },
    plant: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
      },
    },
    components: [
      {
        name: { type: String, required: true, trim: true },
        id: { type: String, required: true }, // UUID
        type: {
          type: String,
          enum: ['gate', 'maas', 'storage', 'rack', 'edge', 'guest', 'network', 'firewall', 'power', 'cooling'],
          required: true,
        },
        status: { type: String, enum: ['active', 'inactive', 'planned'], default: 'inactive' },
        createdAt: { type: Date },
      },
    ],
    operators: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        roles: [
          {
            type: String,
          },
        ],
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    changeLog: [
      {
        changedAt: { type: Date },
        changedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        description: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

const PopModel = model('Pop', PopSchema);

const ProviderSchema = PopSchema;

export { PopSchema, PopModel, ProviderSchema };
