import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const EventSchema = new Schema({});

const EventModel = model('Event', EventSchema);

const ProviderSchema = EventSchema;

export { EventSchema, EventModel, ProviderSchema };
