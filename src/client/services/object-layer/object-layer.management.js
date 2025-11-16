import { DefaultManagement } from '../default/default.management.js';
import { ObjectLayerService } from './object-layer.service.js';
import { commonUserGuard } from '../../components/core/CommonJs.js';
import { getProxyPath, setPath, setQueryParams } from '../../components/core/Router.js';
import { ObjectLayerEngineModal } from '../../components/core/ObjectLayerEngineModal.js';
import { ObjectLayerEngineViewer } from '../../components/core/ObjectLayerEngineViewer.js';
import { s } from '../../components/core/VanillaJs.js';
import { Modal } from '../../components/core/Modal.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';

const ObjectLayerManagement = {
  RenderTable: async ({ Elements, idModal }) => {
    const user = Elements.Data.user.main.model.user;
    const { role } = user;

    // Custom renderer for view button
    class ViewButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id) {
          this.eGui.innerHTML = '';
          return;
        }

        this.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-eye"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-view-object-layer-${data._id}`,
        })}`;

        setTimeout(() => {
          if (s(`.btn-view-object-layer-${data._id}`))
            s(`.btn-view-object-layer-${data._id}`).onclick = async () =>
              setTimeout(async () => {
                // Navigate to viewer route first
                setPath(`${getProxyPath()}object-layer-engine-viewer`);
                // Then add query param without replacing history
                setQueryParams({ cid: data._id }, { replace: true });
                if (s(`.modal-object-layer-engine-viewer`)) {
                  await ObjectLayerEngineViewer.Reload({ Elements });
                }
                s(`.main-btn-object-layer-engine-viewer`).click();
              });
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Custom renderer for edit button
    class EditButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id) {
          this.eGui.innerHTML = '';
          return;
        }

        this.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-edit"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-edit-object-layer-${data._id}`,
        })}`;

        setTimeout(() => {
          if (s(`.btn-edit-object-layer-${data._id}`))
            s(`.btn-edit-object-layer-${data._id}`).onclick = async () =>
              setTimeout(async () => {
                // Navigate to editor route first
                setPath(`${getProxyPath()}object-layer-engine`);
                // Then add query param without replacing history
                setQueryParams({ cid: data._id }, { replace: true });
                if (s(`.modal-object-layer-engine`)) await ObjectLayerEngineModal.Reload();
                else s(`.main-btn-object-layer-engine`).click();
              });
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

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
      // {
      //   field: '_id',
      //   headerName: 'Content ID',
      //   width: 220,
      //   editable: false,
      //   cellClassRules: { m: (params) => true },
      // },
      {
        field: 'data.item.id',
        headerName: 'Item ID',
        editable: role === 'user',
        cellClassRules: { 'row-new-highlight': (params) => true },
      },
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
      {
        field: 'view',
        headerName: '',
        width: 100,
        cellRenderer: ViewButtonRenderer,
        editable: false,
        sortable: false,
        filter: false,
      },
      {
        field: 'edit',
        headerName: '',
        width: 100,
        cellRenderer: EditButtonRenderer,
        editable: false,
        sortable: false,
        filter: false,
      },
    ];

    return await DefaultManagement.RenderTable({
      idModal: idModal ? idModal : 'modal-object-layer-engine-management',
      serviceId: 'object-layer-engine-management',
      entity: 'object-layer',
      permissions: {
        add: commonUserGuard(role),
        remove: commonUserGuard(role),
        reload: commonUserGuard(role),
      },
      customEvent: {
        add: async () => {
          // Navigate to editor route for new object (no query params)
          setPath(`${getProxyPath()}object-layer-engine`);
          if (s(`.modal-object-layer-engine`))
            setTimeout(() => {
              ObjectLayerEngineModal.Reload();
            });
          s(`.main-btn-object-layer-engine`).click();
        },
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
      paginationOptions: {
        limitOptions: [10, 25, 50, 100, 200],
      },
    });
  },
  Reload: async function (subModalId = 'management') {
    const idModal = `modal-object-layer-engine-${subModalId}`;
    if (s(`.modal-object-layer-engine-${subModalId}`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  },
};

export { ObjectLayerManagement };
