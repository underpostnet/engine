import { generateRandomPasswordSelection, strToDateUTC } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { UserService } from '../user/user.service.js';
import { HealthcareAppointmentDto } from './healthcare-appointment.model.js';

const logger = loggerFactory(import.meta);

const HealthcareAppointmentService = {
  post: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.HealthcareAppointment;

    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    /** @type {import('../event-scheduler/event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.EventScheduler;

    const event = await EventScheduler.findById(req.body.eventSchedulerId);
    if (!event) throw new Error(`Could not find event scheduler`);

    const professional = await User.findById(event._doc.creatorUserId);
    if (!professional) throw new Error(`Could not find professional`);

    let patient = await User.findOne({ email: req.body.patient.email });

    if (!patient) {
      const { token, user } = await UserService.post(
        {
          params: {
            id: '',
          },
          path: '',
          query: {},
          body: { ...req.body.patient, role: 'guest', password: generateRandomPasswordSelection(16) },
        },
        {},
        options,
      );
      patient = user;
    }

    req.body.patient.userId = patient._id;
    req.body.professional.userId = professional._doc._id;
    req.body.date = strToDateUTC(req.body.date);

    return await new HealthcareAppointment(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.HealthcareAppointment;

    if (req.path.startsWith('/appointment-dates')) {
      return await HealthcareAppointment.find().select(HealthcareAppointmentDto.select['appointment-dates']());
    }
    return await HealthcareAppointment.find()
      // .select(.select.get())
      .populate(HealthcareAppointmentDto.populate.getUser())
      .populate(HealthcareAppointmentDto.populate.getEventScheduler());
    return await HealthcareAppointment.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.HealthcareAppointment;
    return await HealthcareAppointment.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./healthcare-appointment.model.js').HealthcareAppointmentModel} */
    const HealthcareAppointment =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.HealthcareAppointment;
    return await HealthcareAppointment.findByIdAndDelete(req.params.id);
  },
};

export { HealthcareAppointmentService };
