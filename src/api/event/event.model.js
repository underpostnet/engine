import { Schema, model, Types } from 'mongoose';
import { NotificationSchema } from '../notification/notification.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const EventSchema = new Schema(
  {
    notifications: {
      type: [{ title: { type: String, required: true }, notification: NotificationSchema }],
      default: [],
      immutable: true,
    },
    tags: [{ type: String, immutable: true }],
  },
  {
    timestamps: true,
  },
);

const EventModel = model('Event', EventSchema);

const ProviderSchema = EventSchema;

export { EventSchema, EventModel, ProviderSchema };
