import { DefaultManagement } from '../default/default.management.js';
import { ObjectLayerService } from './object-layer.service.js';
import { commonUserGuard } from '../../components/core/CommonJs.js';
import { getProxyPath } from '../../components/core/Router.js';
import { s } from '../../components/core/VanillaJs.js';
import { Modal } from '../../components/core/Modal.js';

const ObjectLayerManagement = {
  RenderTable: async ({ Elements }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;

    // Custom renderer for the frame 08 preview
    class Frame08Renderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data.data || !data.data.item) {
          this.eGui.innerHTML = '';
          return;
        }

        const { type, id } = data.data.item;
        const imagePath = `${getProxyPath()}assets/${type}/${id}/08/0.png`;

        this.eGui.innerHTML = html`
          <img class="inl" src="${imagePath}" style="width: 100px; height: 100px;" alt="Frame 08" />
        `;
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    let columnDefs = [
      { field: '_id', headerName: 'Storage ID', width: 220, editable: false },
      { field: 'data.item.id', headerName: 'Item ID', editable: role === 'user' },
      { field: 'data.item.type', headerName: 'Item Type', editable: role === 'user' },
      { field: 'data.item.description', headerName: 'Description', flex: 1, editable: role === 'user' },
      {
        field: 'frame08',
        headerName: 'Frame 08 Preview',
        width: 120,
        cellRenderer: Frame08Renderer,
        editable: false,
        sortable: false,
        filter: false,
      },
    ];

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
        reload: commonUserGuard(role),
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
  Reload: async function () {
    const idModal = 'modal-object-layer-engine-management';
    if (s(`.modal-object-layer-engine-management`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  },
};

export { ObjectLayerManagement };
