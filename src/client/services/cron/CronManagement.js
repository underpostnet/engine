import { DefaultManagement } from '../default/DefaultManagement.js';
import { UserService } from '../user/UserService.js';
import { CronService } from './CronService.js';

class CronManagement {
  static instance = async ({ appStore }) => {
    const user = appStore.Data.user.main.model.user;
    const { role } = user;
    let columnDefs = [
      { field: 'deployId', headerName: 'deployId', editable: role === 'admin' },
      { field: 'jobId', headerName: 'jobId', editable: role === 'admin' },
      { field: 'expression', headerName: 'expression', editable: role === 'admin' },
      { field: 'enabled', headerName: 'enabled', editable: role === 'admin' },
    ];
    switch (role) {
      case 'admin':
        {
          columnDefs = columnDefs.concat([]);
        }
        break;

      default:
        break;
    }
    return await DefaultManagement.instance({
      idModal: 'modal-cron-management',
      serviceId: 'cron-management',
      entity: 'cron',
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
      ServiceProvider: CronService,
    });
  };
}

export { CronManagement };
