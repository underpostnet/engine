import { Schema, model, Types } from 'mongoose';
import { medicalSpecialties } from '../../client/components/healthcare/CommonHealthcare.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const HealthcareAppointmentSchema = new Schema({
  eventSchedulerId: { type: Schema.Types.ObjectId, ref: 'EventScheduler' },
  date: { type: Date },
  patient: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    companyType: { type: String, enum: ['private', 'public'] },
    identityDocument: { type: String },
  },
  professional: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    specialty: [
      {
        type: String,
        enum: medicalSpecialties.map((o) => {
          return o.id;
        }),
      },
    ],
  },
});

const HealthcareAppointmentDto = {
  select: {
    'appointment-dates': () => {
      return { date: 1, _id: 1, eventSchedulerId: 1 };
    },
  },
  populate: {
    getUser: () => {
      return {
        path: 'patient.userId',
        select: 'username email phoneNumbers',
      };
    },
    getEventScheduler: () => {
      return {
        path: 'eventSchedulerId',
      };
    },
  },
};

const HealthcareAppointmentModel = model('HealthcareAppointment', HealthcareAppointmentSchema);

const ProviderSchema = HealthcareAppointmentSchema;

export { HealthcareAppointmentSchema, HealthcareAppointmentModel, ProviderSchema, HealthcareAppointmentDto };
