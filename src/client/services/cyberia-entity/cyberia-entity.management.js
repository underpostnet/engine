import { DefaultManagement } from '../default/default.management.js';
import { CyberiaEntityService } from './cyberia-entity.service.js';

class CyberiaEntityManagement {
  static RenderTable = async (options = {}) => {
    const { idModal: rawIdModal, customEvent, readyRowDataEvent } = options;
    const idModal = rawIdModal || 'modal-cyberia-entity-management';

    const renderResult = await DefaultManagement.RenderTable({
      idModal,
      serviceId: 'cyberia-entity-management',
      entity: 'cyberia-entity',
      permissions: {
        add: false,
        remove: true,
        reload: true,
      },
      usePagination: true,
      columnDefs: [
        { field: 'entityType', headerName: 'Entity Type' },
        { field: 'initCellX', headerName: 'initCellX' },
        { field: 'initCellY', headerName: 'initCellY' },
        { field: 'dimX', headerName: 'dimX' },
        { field: 'dimY', headerName: 'dimY' },
        { field: 'color', headerName: 'Color' },
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
      defaultColKeyFocus: 'entityType',
      ServiceProvider: CyberiaEntityService,
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
  };
}

export { CyberiaEntityManagement };
