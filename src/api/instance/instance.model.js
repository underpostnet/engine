import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const InstanceSchema = new Schema(
  {
    deployId: { type: String },
    host: { type: String },
    path: { type: String },
    port: { type: String },
    client: { type: String },
    runtime: { type: String },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    apis: [{ type: String }],
  },
  {
    timestamps: true,
  },
);

const InstanceDto = {
  populate: {
    get: () => {
      return {
        path: 'userId',
        model: 'User',
        select: '_id email',
      };
    },
  },
};

const InstanceModel = model('Instance', InstanceSchema);

const ProviderSchema = InstanceSchema;

export { InstanceSchema, InstanceModel, ProviderSchema, InstanceDto };
