import { BtnIcon } from '../../components/core/BtnIcon.js';
import { getId } from '../../components/core/CommonJs.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { DefaultManagement } from '../default/default.management.js';
import { CyberiaMapService } from './cyberia-map.service.js';

const CyberiaMapManagement = {
  RenderTable: async (options = {}) => {
    const { idModal: rawIdModal, customEvent, readyRowDataEvent, loadMapCallback } = options;
    const idModal = rawIdModal || 'modal-cyberia-map-management';

    class LoadMapActionGridRenderer {
      eGui;
      tokens;

      async init(params) {
        this.eGui = document.createElement('div');
        this.tokens = {};

        const cellRenderId = getId(this.tokens, 'load-map-');
        this.tokens[cellRenderId] = {};

        this.eGui.innerHTML = html`${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fa-solid fa-upload"></i>
          </div>`,
          class: `in fll section-mp management-table-btn-mini management-table-btn-load-map-${idModal}-${cellRenderId} ${
            !params.data._id ? 'hide' : ''
          }`,
        })}`;

        setTimeout(() => {
          EventsUI.onClick(
            `.management-table-btn-load-map-${idModal}-${cellRenderId}`,
            async () => {
              if (!params.data._id) return;
              const result = await CyberiaMapService.get({ id: params.data._id });
              if (result.status === 'success' && result.data) {
                if (loadMapCallback) loadMapCallback(result.data);
                NotificationManager.Push({
                  html: `Map "${result.data.name || result.data.code || params.data._id}" loaded`,
                  status: 'success',
                });
              } else {
                NotificationManager.Push({
                  html: result.message || 'Failed to load map',
                  status: 'error',
                });
              }
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

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
        {
          field: 'load-action',
          headerName: '',
          width: 100,
          cellRenderer: LoadMapActionGridRenderer,
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
