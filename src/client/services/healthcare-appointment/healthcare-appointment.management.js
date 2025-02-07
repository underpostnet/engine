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
      columnDefs: [
        {
          field: 'date',
        },
        {
          field: 'patient',
          headerName: 'Patient',
          children: [
            {
              field: 'patient.companyType',
            },
            {
              field: 'patient.identityDocument',
            },
            {
              field: 'patient.userId',
              headerName: 'User',
              children: [
                { field: 'patient.userId.email' },
                { field: 'patient.userId.username' },
                {
                  headerName: 'Phone Numbers',
                  field: 'patient.userId._phoneNumbers',
                },
              ],
            },
          ],
        },
      ],
      defaultColKeyFocus: 'date',
      customFormat: (obj) => {
        obj.patient.userId._phoneNumbers = obj.patient.userId.phoneNumbers
          .map((t) => `${t.number} (${t.type}) `)
          .join(',');
        return obj;
      },
      ServiceProvider: HealthcareAppointmentService,
    });
  },
};
export { HealthcareAppointmentManagement };
