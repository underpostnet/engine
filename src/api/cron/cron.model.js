import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CronSchema = new Schema({
  expression: { type: String },
  jobId: { type: String },
  deployId: { type: String },
});

const CronModel = model('Cron', CronSchema);

const ProviderSchema = CronSchema;

export { CronSchema, CronModel, ProviderSchema };
