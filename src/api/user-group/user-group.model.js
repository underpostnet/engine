import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const UserGroupSchema = new Schema({});

const UserGroupModel = model('UserGroup', UserGroupSchema);

const ProviderSchema = UserGroupSchema;

export { UserGroupSchema, UserGroupModel, ProviderSchema };
