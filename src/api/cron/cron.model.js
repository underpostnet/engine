import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CronSchema = new Schema(
  {
    0: { type: String },
    1: { type: String },
    2: { type: String },
  },
  {
    timestamps: true,
  },
);

const CronModel = model('Cron', CronSchema);

const ProviderSchema = CronSchema;

export { CronSchema, CronModel, ProviderSchema };
