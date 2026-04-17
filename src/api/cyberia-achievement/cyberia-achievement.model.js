import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaAchievementSchema = new Schema(
  {},
  {
    timestamps: true,
  },
);

const CyberiaAchievementModel = model('CyberiaAchievement', CyberiaAchievementSchema);

const ProviderSchema = CyberiaAchievementSchema;

export { CyberiaAchievementSchema, CyberiaAchievementModel, ProviderSchema };
