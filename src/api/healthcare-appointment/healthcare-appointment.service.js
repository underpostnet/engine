import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const HealthcareAppointmentService = {
  post: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.HealthcareAppointment;
    return await new HealthcareAppointment(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.HealthcareAppointment;
    return await HealthcareAppointment.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.HealthcareAppointment;
    return await HealthcareAppointment.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.HealthcareAppointment;
    return await HealthcareAppointment.findByIdAndDelete(req.params.id);
  },
};

export { HealthcareAppointmentService };
