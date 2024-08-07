import { Schema, model, Types } from 'mongoose';
import validator from 'validator';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const NotificationSchema = new Schema({
  // Visual Options
  body: { type: String }, // <String>
  icon: { type: String, validate: [validator.isURL, 'Please fill a valid icon url'] }, // <URL String>
  image: { type: String, validate: [validator.isURL, 'Please fill a valid image url'] }, // <URL String>
  badge: { type: String, validate: [validator.isURL, 'Please fill a valid badge url'] }, // <URL String>
  dir: { type: String }, // <String of 'auto' | 'ltr' | 'rtl'>
  timestamp: { type: Number }, // <Long>

  // Both visual & behavioral options
  actions: [{ type: String }], // <Array of Strings>
  data: { type: Object, default: {} }, // <Anything>

  // Behavioral Options
  tag: { type: String }, // <String>
  requireInteraction: { type: Boolean }, // <boolean>
  renotify: { type: Boolean }, // <Boolean>
  vibrate: [{ type: Number }], // <Array of Integers>
  sound: { type: String, validate: [validator.isURL, 'Please fill a valid sound url'] }, // <URL String>
  silent: { type: Boolean }, // <Boolean>
});

const NotificationModel = model('Notification', NotificationSchema);

const ProviderSchema = NotificationSchema;

export { NotificationSchema, NotificationModel, ProviderSchema };
