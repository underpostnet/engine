import { DefaultManagement } from '../default/default.management.js';
import { UserService } from '../user/user.service.js';
import { InstanceService } from './instance.service.js';

const InstanceManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;
    let columnDefs = [
      { field: 'host', headerName: 'host', editable: role === 'admin' },
      { field: 'path', headerName: 'path', editable: role === 'admin' },
      { field: 'createdAt', headerName: 'createdAt', cellDataType: 'date', editable: false },
      { field: 'updatedAt', headerName: 'updatedAt', cellDataType: 'date', editable: false },
    ];
    switch (role) {
      case 'admin':
        {
          columnDefs = columnDefs.concat([
            { field: 'deployId', headerName: 'deployId', editable: role === 'admin' },
            {
              field: 'userId',
              headerName: 'User',
              children: [
                {
                  headerName: 'id',
                  field: 'userId',
                  editable: false,
                },
                {
                  headerName: 'Email',
                  field: 'userEmail',
                  editable: role === 'admin',
                },
              ],
            },
          ]);
        }
        break;

      default:
        break;
    }
    return await DefaultManagement.RenderTable({
      idModal: 'modal-instance-management',
      serviceId: 'instance-management',
      entity: 'instance',
      permissions: {
        add: role === 'admin',
        remove: role === 'admin',
      },
      columnDefs,
      customFormat: (obj) => {
        return {
          ...obj,
          userId: obj.userId?._id ? obj.userId._id : undefined,
          userEmail: obj.userId?.email ? obj.userId.email : undefined,
        };
      },
      onRowValueChanged: async (...args) => {
        const [event] = args;
        const { data } = await UserService.get({ id: `email/${event.data.userEmail}` });
        if (data) {
          event.data.userId = data._id;
          return { status: 'success', data: event.data };
        }
        return { status: 'error', message: 'user email not found' };
      },
      defaultColKeyFocus: 'host',
      ServiceProvider: InstanceService,
    });
  },
};

export { InstanceManagement };
