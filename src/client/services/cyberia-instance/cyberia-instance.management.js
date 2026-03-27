import { BtnIcon } from '../../components/core/BtnIcon.js';
import { getId, commonUserGuard, commonAdminGuard } from '../../components/core/CommonJs.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { s } from '../../components/core/VanillaJs.js';
import { DefaultManagement } from '../default/default.management.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';
import { getApiBaseUrl } from '../core/core.service.js';

const CyberiaInstanceManagement = {
  RenderTable: async (options = {}) => {
    const { idModal: rawIdModal, customEvent, readyRowDataEvent, loadInstanceCallback, Elements } = options;
    const idModal = rawIdModal || 'modal-cyberia-instance-management';
    const role = Elements?.Data?.user?.main?.model?.user?.role || 'guest';

    class LoadInstanceActionGridRenderer {
      eGui;
      tokens;

      async init(params) {
        this.eGui = document.createElement('div');
        this.tokens = {};

        const cellRenderId = getId(this.tokens, 'load-instance-');
        this.tokens[cellRenderId] = {};

        this.eGui.innerHTML = html`${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fa-solid fa-upload"></i>
          </div>`,
          class: `in fll section-mp management-table-btn-mini management-table-btn-load-instance-${idModal}-${cellRenderId} ${
            !params.data._id ? 'hide' : ''
          }`,
        })}`;

        setTimeout(() => {
          EventsUI.onClick(
            `.management-table-btn-load-instance-${idModal}-${cellRenderId}`,
            async () => {
              if (!params.data._id) return;
              const result = await CyberiaInstanceService.get({ id: params.data._id });
              if (result.status === 'success' && result.data) {
                if (loadInstanceCallback) await loadInstanceCallback(result.data);
                NotificationManager.Push({
                  html: `Instance "${result.data.name || result.data.code || params.data._id}" loaded`,
                  status: 'success',
                });
              } else {
                NotificationManager.Push({
                  html: result.message || 'Failed to load instance',
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

    class ThumbnailPreviewGridRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data.thumbnail) {
          this.eGui.innerHTML = html`<span style="color: #666; font-style: italic;">—</span>`;
          return;
        }

        const thumbnailId = typeof data.thumbnail === 'object' ? data.thumbnail._id : data.thumbnail;
        if (!thumbnailId) {
          this.eGui.innerHTML = html`<span style="color: #666; font-style: italic;">—</span>`;
          return;
        }

        const imageSrc = getApiBaseUrl({ id: thumbnailId, endpoint: 'file/blob' });

        this.eGui.innerHTML = html`
          <div style="position: relative; width: 60px; height: 60px;">
            <img
              src="${imageSrc}"
              style="width: 60px; height: 60px; object-fit: cover; display: block; border: 1px solid #555;"
              onload="this.style.display='block'; this.nextElementSibling.style.display='none';"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            />
            <div
              style="position: absolute; top: 0; left: 0; width: 60px; height: 60px; display: none; align-items: center; justify-content: center;"
            >
              <i class="fas fa-image" style="font-size: 24px; color: #999;"></i>
            </div>
          </div>
        `;
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
      serviceId: 'cyberia-instance-management',
      entity: 'cyberia-instance',
      permissions: {
        add: false,
        remove: commonUserGuard(role),
        reload: true,
      },
      usePagination: true,
      columnDefs: [
        { field: 'code', headerName: 'Code' },
        { field: 'name', headerName: 'Name' },
        { field: 'description', headerName: 'Description' },
        { field: 'cyberiaMapCodes', headerName: 'Map Codes' },
        { field: 'tags', headerName: 'Tags' },
        { field: 'status', headerName: 'Status' },
        {
          field: 'creator',
          headerName: 'Creator',
          valueGetter: (params) => {
            if (!params.data || !params.data.creator) return '—';
            return typeof params.data.creator === 'object' ? params.data.creator.username || '—' : params.data.creator;
          },
          editable: false,
        },
        {
          field: 'thumbnail',
          headerName: 'Thumbnail',
          width: 80,
          cellRenderer: ThumbnailPreviewGridRenderer,
          editable: false,
          sortable: false,
          filter: false,
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
        {
          field: 'load-action',
          headerName: '',
          width: 100,
          cellRenderer: LoadInstanceActionGridRenderer,
          editable: false,
        },
      ],
      defaultColKeyFocus: 'code',
      ServiceProvider: CyberiaInstanceService,
      customEvent,
    });

    // Clear all button: admin only
    if (!commonAdminGuard(role)) {
      const cleanBtn = s(`.management-table-btn-clean-${idModal}`);
      if (cleanBtn) cleanBtn.classList.add('hide');
    }

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

export { CyberiaInstanceManagement };
