import { generateRandomPasswordSelection, strToDateUTC } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';
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
    if (!patient) patient = await User.findOne({ username: req.body.patient.username });
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

    const result = await new HealthcareAppointment(req.body).save();

    (async () => {
      const id = `${options.host}${options.path}`;
      const translate = {
        H1: { es: 'Cita agendada', en: 'Appointment scheduled' },
        P1: {
          es: `Te hemos agendado una cita en la fecha: ${result._doc.date.toISOString().split('T')[0]} y ${
            result._doc.date.toISOString().slice(0, -8).split('T')[1]
          } Hrs indicadas. La nutricionista se pondrá en contacto contigo para confirmar la cita.`,
          en: `We have scheduled an appointment on the specified date ${
            result._doc.date.toISOString().split('T')[0]
          } and ${
            result._doc.date.toISOString().slice(0, -8).split('T')[1]
          } Hrs. time. The nutritionist will contact you to confirm the appointment.`,
        },
      };
      const sendResult = await MailerProvider.send({
        id,
        sendOptions: {
          to: req.body.patient.email, // list of receivers
          subject: translate.H1[req.lang], // Subject line
          text: translate.H1[req.lang], // plain text body
          html: MailerProvider.instance[id].templates.userVerifyEmail
            .replace('img', `img style='display: none'`)
            .replace('{{H1}}', translate.H1[req.lang])
            .replace('{{P1}}', translate.P1[req.lang])
            .replace(`{{COMPANY}}`, options.host), // html body
          attachments: [
            // {
            //   filename: 'logo.png',
            //   path: `./logo.png`,
            //   cid: 'logo', // <img src='cid:logo'>
            // },
          ],
        },
      });
    })();

    return result;
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
