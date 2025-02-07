import { commonModeratorGuard } from '../../components/core/CommonJs.js';
import { DefaultManagement } from '../default/default.management.js';
import { HealthcareAppointmentService } from './healthcare-appointment.service.js';

const HealthcareAppointmentManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;
    return await DefaultManagement.RenderTable({
      idModal: 'modal-healthcare-appointment-management',
      serviceId: 'healthcare-appointment-management',
      entity: 'healthcare-appointment',
      permissions: {
        add: commonModeratorGuard(role),
        remove: commonModeratorGuard(role),
      },
      columnDefs: [{ field: 'date', cellDataType: 'date' }, { field: 'eventSchedulerId' }],
      // defaultColKeyFocus: '',
      ServiceProvider: HealthcareAppointmentService,
    });
  },
};
export { HealthcareAppointmentManagement };
