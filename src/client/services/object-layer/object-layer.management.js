import { DefaultManagement } from '../default/default.management.js';
import { ObjectLayerService } from './object-layer.service.js';
import { commonUserGuard, commonModeratorGuard, commonAdminGuard } from '../../components/core/CommonJs.js';
import { AtlasSpriteSheetService } from '../atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerEngineViewer } from '../../components/object-layer/ObjectLayerEngineViewer.js';
import { s } from '../../components/core/VanillaJs.js';
import { Modal } from '../../components/core/Modal.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { AgGrid } from '../../components/core/AgGrid.js';
import { EventsUI } from '../../components/core/EventsUI.js';

/** Opens the editor. Loaded on demand: a read-only host ships the list without it. */
const openEngine = async (options) => {
  const { ObjectLayerEngineModal } = await import('../../components/object-layer/ObjectLayerEngineModal.js');
  return ObjectLayerEngineModal.open(options);
};

class ObjectLayerManagement {
  /**
   * @param {Object} options
   * @param {Object} options.appStore - Host app store.
   * @param {string} [options.idModal] - Modal id.
   * @param {boolean} [options.readOnly=false] - Explorer mode: no add, edit or delete; the host has no editor route.
   * @param {boolean} [options.lifecycle=false] - The host is the Object Layer authority: a moderator archives a
   *   definition or offers it again.
   */
  static instance = async ({ appStore, idModal: rawIdModal, readOnly = false, lifecycle = false }) => {
    const idModal = rawIdModal || 'modal-object-layer-engine-management';
    const serviceId = 'object-layer-engine-management';
    const gridId = `${serviceId}-grid-${idModal}`;
    const user = appStore.Data.user.main.model.user;
    const { role } = user;
    const canEdit = !readOnly && commonModeratorGuard(role);
    const canArchive = lifecycle && commonModeratorGuard(role);
    const canPurge = lifecycle && commonAdminGuard(role);

    // Custom renderer for view button
    class ViewButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data?.cid) {
          this.eGui.innerHTML = '';
          return;
        }

        this.eGui.innerHTML = html` ${await BtnIcon.instance({
          label: html`<div class="abs center">
            <i class="fas fa-eye"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-view-object-layer-${idModal}-${data._id}`,
        })}`;

        setTimeout(() =>
          EventsUI.onClick(
            `.btn-view-object-layer-${idModal}-${data._id}`,
            async () => await ObjectLayerEngineViewer.open({ appStore, cid: data.cid }),
            { context: 'modal' },
          ),
        );
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

        if (!data?.cid) {
          this.eGui.innerHTML = '';
          return;
        }

        this.eGui.innerHTML = html` ${await BtnIcon.instance({
          label: html`<div class="abs center">
            <i class="fas fa-edit"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-edit-object-layer-${idModal}-${data._id}`,
        })}`;

        setTimeout(() =>
          EventsUI.onClick(
            `.btn-edit-object-layer-${idModal}-${data._id}`,
            async () => await openEngine({ cid: data.cid }),
            { context: 'modal' },
          ),
        );
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

        if (!data?.cid) {
          this.eGui.innerHTML = '';
          return;
        }

        // The Object Layer domain serves the still of a definition that names a render; one
        // that names none shows the placeholder without a request.
        const rendered = !!data.data?.render?.cid;
        const placeholder = rendered ? 'none' : 'flex';
        const image = rendered
          ? html`<img
              class="inl frame-08-preview"
              src="${AtlasSpriteSheetService.idlePreviewUrl(data.cid)}"
              style="width: 100px; height: 100px; display: block; image-rendering: pixelated;"
              alt="Frame 08"
              onload="this.style.display='block'; this.nextElementSibling.style.display='none';"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            />`
          : '';

        this.eGui.innerHTML = html`
          <div style="position: relative; width: 100px; height: 100px;">
            ${image}
            <div
              style="position: absolute; top: 0; left: 0; width: 100px; height: 100px; display: ${placeholder}; align-items: center; justify-content: center; "
            >
              <i class="fas fa-image" style="font-size: 48px; color: #999;"></i>
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

    // Custom renderer for delete button (moderator+ only)
    const canDelete = canEdit;

    class DeleteButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;

        if (!data || !data._id || !canDelete) {
          this.eGui.innerHTML = '';
          return;
        }

        this.eGui.innerHTML = html` ${await BtnIcon.instance({
          label: html`<div class="abs center">
            <i class="fas fa-trash" style="color: #dc3545;"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-delete-object-layer-${idModal}-${data._id}`,
        })}`;

        setTimeout(() =>
          EventsUI.onClick(
            `.btn-delete-object-layer-${idModal}-${data._id}`,
            async () => {
              const itemId = data?.data?.item?.id || data._id;
              const confirmResult = await Modal.RenderConfirm({
                id: `delete-object-layer-${data._id}`,
                html: async () => html`
                  <div class="in section-mp" style="text-align: center">
                    <p>Remove object layer <strong>"${itemId}"</strong> from this host?</p>
                    <p style="color: #dc3545; font-size: 13px; margin-top: 8px;">
                      This unbinds the label and removes this host's copy: render frames, atlas and static asset files.
                      A published definition stays at the Object Layer authority under its CID.
                    </p>
                  </div>
                `,
              });
              if (confirmResult.status !== 'confirm') return;
              try {
                const result = await ObjectLayerService.delete({ id: data._id });
                if (result.status === 'success') {
                  AtlasSpriteSheetService.invalidateIdlePreview(itemId);
                  NotificationManager.Push({
                    html: `Object layer "${itemId}" removed from this host`,
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
            },
            { context: 'modal' },
          ),
        );
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Archive or restore: the definition stays stored under its cid either way.
    class LifecycleButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;
        if (!data?.cid || !canArchive) {
          this.eGui.innerHTML = '';
          return;
        }
        const archived = !!data.archivedAt;
        this.eGui.innerHTML = html` ${await BtnIcon.instance({
          label: html`<div class="abs center">
            <i class="fas ${archived ? 'fa-box-open' : 'fa-box-archive'}"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-lifecycle-object-layer-${idModal}-${data._id}`,
        })}`;
        setTimeout(() =>
          EventsUI.onClick(
            `.btn-lifecycle-object-layer-${idModal}-${data._id}`,
            async () => {
              const itemId = data?.data?.item?.id || data._id;
              const confirmResult = await Modal.RenderConfirm({
                id: `lifecycle-object-layer-${data._id}`,
                html: async () => html`
                  <div class="in section-mp" style="text-align: center">
                    <p>${archived ? 'Offer' : 'Archive'} object layer <strong>"${itemId}"</strong>?</p>
                    <p style="font-size: 13px; margin-top: 8px;">
                      ${
                        archived
                          ? 'The definition is offered again under its CID.'
                          : 'The definition stays stored under its CID and is offered to no one. Cyberia unbinds its labels on reconciliation.'
                      }
                    </p>
                  </div>
                `,
              });
              if (confirmResult.status !== 'confirm') return;
              try {
                const result = await ObjectLayerService.lifecycle({ id: data.cid, archived: !archived });
                if (result.status !== 'success') throw new Error(result.message || 'Failed to change lifecycle');
                NotificationManager.Push({
                  html: `Object layer "${itemId}" ${archived ? 'offered again' : 'archived'}`,
                  status: 'success',
                });
                await DefaultManagement.loadTable(idModal);
              } catch (error) {
                NotificationManager.Push({ html: `Failed to change lifecycle: ${error.message}`, status: 'error' });
              }
            },
            { context: 'modal' },
          ),
        );
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    // Purge: every record this host stores of the definition goes, and nothing restores it.
    class PurgeButtonRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { data } = params;
        if (!data?.cid || !canPurge) {
          this.eGui.innerHTML = '';
          return;
        }
        this.eGui.innerHTML = html` ${await BtnIcon.instance({
          label: html`<div class="abs center">
            <i class="fas fa-eraser" style="color: #dc3545;"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini btn-purge-object-layer-${idModal}-${data._id}`,
        })}`;
        setTimeout(() =>
          EventsUI.onClick(
            `.btn-purge-object-layer-${idModal}-${data._id}`,
            async () => {
              const itemId = data?.data?.item?.id || data._id;
              const confirmResult = await Modal.RenderConfirm({
                id: `purge-object-layer-${data._id}`,
                html: async () => html`
                  <div class="in section-mp" style="text-align: center">
                    <p>Purge object layer <strong>"${itemId}"</strong> from this host?</p>
                    <p style="color: #dc3545; font-size: 13px; margin-top: 8px;">
                      This removes every record of it: the definition, its render frames, its atlas and render files,
                      its IPFS pin records, the pinned content and its MFS paths, and the labels bound to it. Nothing
                      restores it.
                    </p>
                    <p style="font-size: 13px; margin-top: 8px;">${data.cid}</p>
                  </div>
                `,
              });
              if (confirmResult.status !== 'confirm') return;
              try {
                const result = await ObjectLayerService.purge({ id: data.cid, cid: data.cid });
                if (result.status !== 'success') throw new Error(result.message || 'Failed to purge object layer');
                AtlasSpriteSheetService.invalidateIdlePreview(itemId);
                const { objectLayers, renderFrames, atlases, files, pinRecords, unpinned, mfsPaths } = result.data;
                NotificationManager.Push({
                  html: `Purged "${itemId}": ${objectLayers} definition, ${renderFrames} render frames, ${atlases} atlas, ${files} files, ${pinRecords} pin records, ${unpinned} unpinned, ${mfsPaths} MFS paths`,
                  status: 'success',
                });
                await DefaultManagement.loadTable(idModal);
              } catch (error) {
                NotificationManager.Push({ html: `Failed to purge: ${error.message}`, status: 'error' });
              }
            },
            { context: 'modal' },
          ),
        );
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    const createCidRenderer = (cidAccessor) => {
      return class {
        eGui;

        async init(params) {
          this.eGui = document.createElement('div');
          const { data } = params;
          const cid = cidAccessor(data) || '';

          if (!cid) {
            this.eGui.innerHTML = html`<span style="color: #666; font-style: italic;">—</span>`;
            return;
          }

          this.eGui.innerHTML = html`<span
            title="${cid}"
            style="font-family: monospace; font-size: 11px; cursor: default; user-select: all;"
            >${cid}</span
          >`;
        }

        getGui() {
          return this.eGui;
        }

        refresh(params) {
          return true;
        }
      };
    };

    // Canonical Object Layer CID: the identity of the definition
    const CidRenderer = createCidRenderer((d) => d?.cid);
    // Canonical render CID: the primary render the definition names
    const RenderCidRenderer = createCidRenderer((d) => d?.data?.render?.cid);
    // Canonical metadata CID: the layout of that render
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
        editable: canEdit,
      },
      { field: 'data.item.type', headerName: 'Item Type', editable: canEdit },
      { field: 'data.item.description', headerName: 'Description', flex: 1, editable: canEdit },
      {
        field: 'cid',
        headerName: 'Object Layer CID',
        width: 160,
        cellRenderer: CidRenderer,
        editable: false,
        sortable: false,
        filter: 'agTextColumnFilter',
      },
      {
        field: 'data.render.cid',
        headerName: 'render CID',
        width: 160,
        cellRenderer: RenderCidRenderer,
        editable: false,
        sortable: false,
        filter: 'agTextColumnFilter',
      },
      {
        field: 'data.render.metadataCid',
        headerName: 'render Metadata CID',
        width: 160,
        cellRenderer: MetadataCidRenderer,
        editable: false,
        sortable: false,
        filter: 'agTextColumnFilter',
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        valueGetter: (params) => (params.data?.archivedAt ? 'archived' : params.data?.origin || ''),
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
      ...(canEdit
        ? [
            {
              field: 'edit',
              headerName: '',
              width: 100,
              cellRenderer: EditButtonRenderer,
              editable: false,
              sortable: false,
              filter: false,
            },
          ]
        : []),
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
      ...(canArchive
        ? [
            {
              field: 'lifecycle',
              headerName: '',
              width: 100,
              cellRenderer: LifecycleButtonRenderer,
              editable: false,
              sortable: false,
              filter: false,
            },
          ]
        : []),
      ...(canPurge
        ? [
            {
              field: 'purge',
              headerName: '',
              width: 100,
              cellRenderer: PurgeButtonRenderer,
              editable: false,
              sortable: false,
              filter: false,
            },
          ]
        : []),
    ];

    return await DefaultManagement.instance({
      idModal,
      serviceId,
      entity: 'object-layer',
      permissions: {
        add: canEdit,
        remove: false,
        reload: commonUserGuard(role),
      },
      customEvent: {
        add: async () => openEngine(),
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
