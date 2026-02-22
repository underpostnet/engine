import { DefaultManagement } from '../default/default.management.js';
import { UserService } from './user.service.js';

const UserManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;
    return await DefaultManagement.RenderTable({
      idModal: 'modal-user-management',
      serviceId: 'user-management',
      entity: 'user',
      permissions: {
        add: role === 'admin',
        remove: role === 'admin',
      },
      usePagination: true,
      columnDefs: [
        { field: 'username', headerName: 'username', editable: role === 'admin' },
        { field: 'email', headerName: 'email', editable: role === 'admin' },
        { field: 'password', headerName: 'password', editable: role === 'admin' },
        {
          field: 'role',
          headerName: 'role',
          editable: role === 'admin',
        },
        {
          field: 'emailConfirmed',
          headerName: 'emailConfirmed',
          cellDataType: 'boolean',
          cellRendererParams: { disabled: true },
          editable: role === 'admin',
        },
        {
          field: 'createdAt',
          headerName: 'createdAt',
          cellDataType: 'date',
          editable: false,
        },
        {
          field: 'updatedAt',
          headerName: 'updatedAt',
          cellDataType: 'date',
          editable: false,
        },
      ],
      defaultColKeyFocus: 'username',
      ServiceProvider: UserService,
    });
  },
};
export { UserManagement };
