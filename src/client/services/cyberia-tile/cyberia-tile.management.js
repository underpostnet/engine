import { getProxyPath } from '../../components/core/Router.js';
import { DefaultManagement } from '../default/default.management.js';
import { CyberiaTileService } from './cyberia-tile.service.js';

const CyberiaTileManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;

    class TilePreviewGridRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { rowIndex } = params;
        const { createdAt, updatedAt, fileId } = params.data;

        this.eGui.innerHTML = html`<a href="${getProxyPath()}api/file/blob/${fileId}">
          <img class="in img-cyberia-tile-management-grid-preview" src="${getProxyPath()}api/file/blob/${fileId}" />
        </a>`;
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    let columnDefs = [
      { field: '_id', headerName: '_id', editable: role === 'admin' },
      { field: 'name', headerName: 'name', editable: role === 'admin' },
      { field: 'fileId', headerName: 'fileId', editable: role === 'admin' },
      {
        field: 'preview',
        headerName: 'preview',
        width: 200,
        cellRenderer: TilePreviewGridRenderer,
        editable: false,
      },
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
    return html` <style>
        .img-cyberia-tile-management-grid-preview {
          width: 100%;
          height: auto;
          object-fit: cover;
        }
      </style>
      ${await DefaultManagement.RenderTable({
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
        onRowValueChanged: async (...args) => {},
        defaultColKeyFocus: 'host',
        ServiceProvider: CyberiaTileService,
      })}`;
  },
};

export { CyberiaTileManagement };
