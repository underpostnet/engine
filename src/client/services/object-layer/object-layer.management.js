import { DefaultManagement } from '../default/default.management.js';
import { ObjectLayerService } from './object-layer.service.js';
import { commonUserGuard, commonModeratorGuard } from '../../components/core/CommonJs.js';
import { getProxyPath, setPath, setQueryParams } from '../../components/core/Router.js';
import { ObjectLayerEngineModal } from '../../components/cyberia/ObjectLayerEngineModal.js';
import { ObjectLayerEngineViewer } from '../../components/cyberia/ObjectLayerEngineViewer.js';
import { s } from '../../components/core/VanillaJs.js';
import { Modal } from '../../components/core/Modal.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { AgGrid } from '../../components/core/AgGrid.js';

class ObjectLayerManagement {
  static RenderTable = async ({ appStore, idModal: rawIdModal }) => {
    const idModal = rawIdModal || 'modal-object-layer-engine-management';
    const serviceId = 'object-layer-engine-management';
    const gridId = `${serviceId}-grid-${idModal}`;
    const user = appStore.Data.user.main.model.user;
    const { role } = user;

    // Custom renderer for view button
    class ViewButtonRenderer {
      eGui;

      async init(params) {
        ObjectLayerManagement.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id) {
          ObjectLayerManagement.eGui.innerHTML = '';
          return;
        }

        ObjectLayerManagement.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-eye"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-view-object-layer-${data._id}`,
        })}`;

        setTimeout(() => {
          const btn = ObjectLayerManagement.eGui.querySelector(`.btn-view-object-layer-${data._id}`);
          if (btn)
            btn.onclick = async () =>
              setTimeout(async () => {
                // Navigate to viewer route first
                setPath(`${getProxyPath()}object-layer-engine-viewer`);
                // Then add query param without replacing history
                setQueryParams({ id: data._id }, { replace: true });
                if (s(`.modal-object-layer-engine-viewer`)) {
                  await ObjectLayerEngineViewer.Reload({ appStore, force: true });
                }
                s(`.main-btn-object-layer-engine-viewer`).click();
              });
        });
      }

      getGui() {
        return ObjectLayerManagement.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Custom renderer for edit button
    class EditButtonRenderer {
      eGui;

      async init(params) {
        ObjectLayerManagement.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id) {
          ObjectLayerManagement.eGui.innerHTML = '';
          return;
        }

        ObjectLayerManagement.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-edit"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-edit-object-layer-${data._id}`,
        })}`;

        setTimeout(() => {
          const btn = ObjectLayerManagement.eGui.querySelector(`.btn-edit-object-layer-${data._id}`);
          if (btn)
            btn.onclick = async () =>
              setTimeout(async () => {
                // Navigate to editor route first
                setPath(`${getProxyPath()}object-layer-engine`);
                // Then add query param without replacing history
                setQueryParams({ id: data._id }, { replace: true });
                if (s(`.modal-object-layer-engine`)) await ObjectLayerEngineModal.Reload();
                else s(`.main-btn-object-layer-engine`).click();
              });
        });
      }

      getGui() {
        return ObjectLayerManagement.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Custom renderer for the frame 08 preview
    class Frame08Renderer {
      eGui;

      async init(params) {
        ObjectLayerManagement.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data.data || !data.data.item) {
          ObjectLayerManagement.eGui.innerHTML = '';
          return;
        }

        const { type, id } = data.data.item;
        const imagePath = `${getProxyPath()}assets/${type}/${id}/08/0.png`;

        // Container with both image and fallback
        ObjectLayerManagement.eGui.innerHTML = html`
          <div style="position: relative; width: 100px; height: 100px;">
            <img
              class="inl frame-08-preview"
              src="${imagePath}"
              style="width: 100px; height: 100px; display: block;"
              alt="Frame 08"
              onload="ObjectLayerManagement.style.display='block'; ObjectLayerManagement.nextElementSibling.style.display='none';"
              onerror="ObjectLayerManagement.style.display='none'; ObjectLayerManagement.nextElementSibling.style.display='flex';"
            />
            <div
              style="position: absolute; top: 0; left: 0; width: 100px; height: 100px; display: none; align-items: center; justify-content: center; "
            >
              <i class="fas fa-image" style="font-size: 48px; color: #999;"></i>
            </div>
          </div>
        `;
      }

      getGui() {
        return ObjectLayerManagement.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Custom renderer for delete button (moderator+ only)
    const canDelete = commonModeratorGuard(role);

    class DeleteButtonRenderer {
      eGui;

      async init(params) {
        ObjectLayerManagement.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id || !canDelete) {
          ObjectLayerManagement.eGui.innerHTML = '';
          return;
        }

        ObjectLayerManagement.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-trash" style="color: #dc3545;"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-delete-object-layer-${data._id}`,
        })}`;

        setTimeout(() => {
          const btn = ObjectLayerManagement.eGui.querySelector(`.btn-delete-object-layer-${data._id}`);
          if (btn)
            btn.onclick = async () => {
              const itemId = data?.data?.item?.id || data._id;
              const confirmResult = await Modal.RenderConfirm({
                id: `delete-object-layer-${data._id}`,
                html: async () => html`
                  <div class="in section-mp" style="text-align: center">
                    <p>Are you sure you want to permanently delete object layer <strong>"${itemId}"</strong>?</p>
                    <p style="color: #dc3545; font-size: 13px; margin-top: 8px;">
                      This will remove all associated data including render frames, atlas sprite sheet, IPFS pins, and
                      static asset files.
                    </p>
                  </div>
                `,
              });
              if (confirmResult.status !== 'confirm') return;
              try {
                const result = await ObjectLayerService.delete({ id: data._id });
                if (result.status === 'success') {
                  NotificationManager.Push({
                    html: `Object layer "${itemId}" deleted successfully`,
                    status: 'success',
                  });
                  if (AgGrid.grids[gridId]) {
                    AgGrid.grids[gridId].applyTransaction({ remove: [data] });
                  }
                  const token = DefaultManagement.Tokens[idModal];
                  if (token) {
                    const newTotal = token.total - 1;
                    const newTotalPages = Math.ceil(newTotal / token.limit);
                    if (token.page > newTotalPages && newTotalPages > 0) {
                      token.page = newTotalPages;
                    }
                    await DefaultManagement.loadTable(idModal, { reload: false });
                  }
                } else {
                  throw new Error(result.message || 'Failed to delete object layer');
                }
              } catch (error) {
                NotificationManager.Push({
                  html: `Failed to delete: ${error.message}`,
                  status: 'error',
                });
              }
            };
        });
      }

      getGui() {
        return ObjectLayerManagement.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    const createCidRenderer = (cidAccessor) => {
      return class {
        eGui;

        async init(params) {
          ObjectLayerManagement.eGui = document.createElement('div');
          const { data } = params;
          const cid = cidAccessor(data) || '';

          if (!cid) {
            ObjectLayerManagement.eGui.innerHTML = html`<span style="color: #666; font-style: italic;">—</span>`;
            return;
          }

          ObjectLayerManagement.eGui.innerHTML = html`<span
            title="${cid}"
            style="font-family: monospace; font-size: 11px; cursor: default; user-select: all;"
            >${cid}</span
          >`;
        }

        getGui() {
          return ObjectLayerManagement.eGui;
        }

        refresh(params) {
          return true;
        }
      };
    };

    // IPFS CID of object layer data JSON (fast-json-stable-stringify)
    const CidRenderer = createCidRenderer((d) => d?.cid);
    // IPFS CID of the consolidated atlas sprite sheet PNG
    const AtlasCidRenderer = createCidRenderer((d) => d?.data?.render?.cid || d?.atlasSpriteSheetId?.cid);
    // IPFS CID of the atlas sprite sheet metadata JSON (fast-json-stable-stringify)
    const MetadataCidRenderer = createCidRenderer((d) => d?.data?.render?.metadataCid);

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
      },
      { field: 'data.item.type', headerName: 'Item Type', editable: role === 'user' },
      { field: 'data.item.description', headerName: 'Description', flex: 1, editable: role === 'user' },
      {
        field: 'data.ledger.type',
        headerName: 'Ledger Type',
        width: 160,
        editable: false,
        sortable: false,
        filter: false,
      },
      {
        field: 'cid',
        headerName: 'IPFS CID',
        width: 160,
        cellRenderer: CidRenderer,
        editable: false,
        sortable: false,
        filter: false,
      },
      {
        field: 'data.render.cid',
        headerName: 'Render CID',
        width: 160,
        cellRenderer: AtlasCidRenderer,
        editable: false,
        sortable: false,
        filter: false,
      },
      {
        field: 'data.render.metadataCid',
        headerName: 'Render Metadata CID',
        width: 160,
        cellRenderer: MetadataCidRenderer,
        editable: false,
        sortable: false,
        filter: false,
      },
      {
        field: 'frame08',
        headerName: 'First IDLE frame preview',
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
      ...(canDelete
        ? [
            {
              field: 'delete',
              headerName: '',
              width: 100,
              cellRenderer: DeleteButtonRenderer,
              editable: false,
              sortable: false,
              filter: false,
            },
          ]
        : []),
    ];

    return await DefaultManagement.RenderTable({
      idModal,
      serviceId,
      entity: 'object-layer',
      permissions: {
        add: commonUserGuard(role),
        remove: false,
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
  };
  static async Reload(subModalId = 'management') {
    const idModal = `modal-object-layer-engine-${subModalId}`;
    if (s(`.modal-object-layer-engine-${subModalId}`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  }
}

export { ObjectLayerManagement };
