import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const HealthcareAppointmentSchema = new Schema({
  eventSchedulerId: { type: Schema.Types.ObjectId, ref: 'EventScheduler' },
  patient: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  professional: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
});

const HealthcareAppointmentModel = model('HealthcareAppointment', HealthcareAppointmentSchema);

const ProviderSchema = HealthcareAppointmentSchema;

export { HealthcareAppointmentSchema, HealthcareAppointmentModel, ProviderSchema };
