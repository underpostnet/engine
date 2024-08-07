import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const NotificationSchema = new Schema({});

const NotificationModel = model('Notification', NotificationSchema);

const ProviderSchema = NotificationSchema;

export { NotificationSchema, NotificationModel, ProviderSchema };
