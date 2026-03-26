import { DefaultManagement } from '../default/default.management.js';
import { CyberiaMapService } from './cyberia-map.service.js';

const CyberiaMapManagement = {
  RenderTable: async (options = {}) => {
    const { idModal: rawIdModal, customEvent, readyRowDataEvent } = options;
    const idModal = rawIdModal || 'modal-cyberia-map-management';

    const renderResult = await DefaultManagement.RenderTable({
      idModal,
      serviceId: 'cyberia-map-management',
      entity: 'cyberia-map',
      permissions: {
        add: false,
        remove: true,
        reload: true,
      },
      usePagination: true,
      columnDefs: [
        { field: 'code', headerName: 'Code' },
        { field: 'name', headerName: 'Name' },
        { field: 'description', headerName: 'Description' },
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
      defaultColKeyFocus: 'code',
      ServiceProvider: CyberiaMapService,
      customEvent,
    });

    if (readyRowDataEvent) {
      if (!DefaultManagement.Tokens[idModal].readyRowDataEvent)
        DefaultManagement.Tokens[idModal].readyRowDataEvent = {};

      for (const key of Object.keys(readyRowDataEvent)) {
        DefaultManagement.Tokens[idModal].readyRowDataEvent[key] = readyRowDataEvent[key];
      }
    }

    return renderResult;
  },
};

export { CyberiaMapManagement };
