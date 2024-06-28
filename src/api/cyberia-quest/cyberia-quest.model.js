import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaQuestSchema = new Schema({});

const CyberiaQuestModel = model('CyberiaQuest', CyberiaQuestSchema);

const ProviderSchema = CyberiaQuestSchema;

export { CyberiaQuestSchema, CyberiaQuestModel, ProviderSchema };
