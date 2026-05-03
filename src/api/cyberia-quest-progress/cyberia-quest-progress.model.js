import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestProgressSchema = new Schema(
  {},
  {
    timestamps: true,
  },
);

const CyberiaQuestProgressModel = model('CyberiaQuestProgress', CyberiaQuestProgressSchema);

const ProviderSchema = CyberiaQuestProgressSchema;

export { CyberiaQuestProgressSchema, CyberiaQuestProgressModel, ProviderSchema };
