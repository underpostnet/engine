import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const HealthcareAppointmentSchema = new Schema({});

const HealthcareAppointmentModel = model('HealthcareAppointment', HealthcareAppointmentSchema);

const ProviderSchema = HealthcareAppointmentSchema;

export { HealthcareAppointmentSchema, HealthcareAppointmentModel, ProviderSchema };
