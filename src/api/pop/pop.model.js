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
        required: true,
        validate: {
          validator: (coords) =>
            coords.length === 2 && coords[0] >= -180 && coords[0] <= 180 && coords[1] >= -90 && coords[1] <= 90,
          message: 'Coordenadas inválidas',
        },
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
        createdAt: { type: Date, default: Date.now },
      },
    ],
    operator: {
      type: {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      },
      required: true,
    },
    createdBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    updatedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    changeLog: [
      {
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String },
        description: { type: String },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

PopSchema.index({ location: '2dsphere' });
PopSchema.index({ operator: 1, companyCode: 1 });
PopSchema.index({ popId: 1 }, { unique: true });

const PopModel = model('Pop', PopSchema);

const ProviderSchema = PopSchema;

export { PopSchema, PopModel, ProviderSchema };
