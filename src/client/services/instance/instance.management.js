import { DefaultManagement } from '../default/default.management.js';
import { UserService } from '../user/user.service.js';
import { InstanceService } from './instance.service.js';

const InstanceManagement = {
  RenderTable: async () =>
    await DefaultManagement.RenderTable({
      idModal: 'modal-instance-management',
      serviceId: 'instance-management',
      entity: 'instance',
      columnDefs: [
        { field: 'host', headerName: 'host' },
        { field: 'path', headerName: 'path' },
        { field: 'deployId', headerName: 'deployId' },
        {
          field: 'userId',
          headerName: 'User',
          children: [
            {
              headerName: 'id',
              field: 'userId',
            },
            {
              headerName: 'Email',
              field: 'userEmail',
            },
          ],
        },
        { field: 'createdAt', headerName: 'createdAt', cellDataType: 'date', editable: false },
        { field: 'updatedAt', headerName: 'updatedAt', cellDataType: 'date', editable: false },
      ],
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
    }),
};

export { InstanceManagement };
