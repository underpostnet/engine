import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// https://fullcalendar.io/docs/event-object

const EventSchedulerSchema = new Schema(
  {
    start: { type: Date },
    end: { type: Date },
    description: { type: String },
    title: { type: String },
    allDay: { type: Boolean },
    creatorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    daysOfWeek: [{ type: String }],
    startTime: { type: String },
    endTime: { type: String },
    groupId: { type: String },
    color: { type: String },
    timeZoneClient: { type: String },
  },
  {
    timestamps: true,
  },
);

const EventSchedulerModel = model('EventScheduler', EventSchedulerSchema);

const ProviderSchema = EventSchedulerSchema;

export { EventSchedulerSchema, EventSchedulerModel, ProviderSchema };
