import { DefaultManagement } from '../default/default.management.js';
import { ObjectLayerService } from './object-layer.service.js';
import { commonUserGuard } from '../../components/core/CommonJs.js';

const ObjectLayerManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;
    let columnDefs = [{ field: 'data.item.id', headerName: 'itemId', editable: role === 'user' }];
    switch (role) {
      case 'admin':
        {
        }
        break;

      default:
        break;
    }
    return await DefaultManagement.RenderTable({
      idModal: 'modal-object-layer-engine-management',
      serviceId: 'object-layer-engine-management',
      entity: 'object-layer',
      permissions: {
        add: commonUserGuard(role),
        remove: commonUserGuard(role),
      },
      columnDefs,
      customFormat: (obj) => {
        return {
          ...obj,
        };
      },
      onRowValueChanged: async (...args) => {
        const [event] = args;
        return { status: 'success', data: event.data };
      },
      defaultColKeyFocus: 'data.item.id',
      ServiceProvider: ObjectLayerService,
    });
  },
};

export { ObjectLayerManagement };
