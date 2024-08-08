import { Schema, model, Types } from 'mongoose';
import { NotificationSchema } from '../notification/notification.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const EventSchema = new Schema(
  {
    notifications: [
      {
        notification: NotificationSchema,
        type: { type: String, enum: ['email', 'sms', 'push'] },
        message: { type: String }, // Message | Title | Subject
        recipient: {
          userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
          botId: {
            type: Schema.Types.ObjectId,
            ref: 'Bot',
          },
        },
        readAt: { type: Date },
      },
    ],
    description: { type: String, required: true },
    tags: [{ type: String }], // severity: error | warn | info | <instance>
    code: { type: String }, // internal event id identifier
    sender: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      botId: {
        type: Schema.Types.ObjectId,
        ref: 'Bot',
      },
    },
  },
  {
    timestamps: true, // sentAt
  },
);

const EventModel = model('Event', EventSchema);

const ProviderSchema = EventSchema;

export { EventSchema, EventModel, ProviderSchema };
