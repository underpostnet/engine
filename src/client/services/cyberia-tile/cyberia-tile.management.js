import { DefaultManagement } from '../default/default.management.js';
import { CyberiaTileService } from './cyberia-tile.service.js';

const CyberiaTileManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;
    let columnDefs = [
      { field: '_id', headerName: '_id', editable: role === 'admin' },
      { field: 'name', headerName: 'name', editable: role === 'admin' },
      { field: 'fileId', headerName: 'fileId', editable: role === 'admin' },
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
    return await DefaultManagement.RenderTable({
      idModal: 'modal-cyberia-tile-management',
      serviceId: 'cyberia-tile-management',
      entity: 'cyberia-tile',
      permissions: {
        add: role === 'admin',
        remove: role === 'admin',
      },
      columnDefs,
      customFormat: (obj) => {
        return {
          ...obj,
        };
      },
      onRowValueChanged: async (...args) => {
        const [event] = args;
        const { data } = {};
        if (data) {
          return { status: 'success', data: event.data };
        }
        return { status: 'error', message: 'user email not found' };
      },
      defaultColKeyFocus: 'host',
      ServiceProvider: CyberiaTileService,
    });
  },
};

export { CyberiaTileManagement };
