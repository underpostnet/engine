import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { getId, getValueFromJoinString, timer } from '../../components/core/CommonJs.js';
import { darkTheme } from '../../components/core/Css.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { Modal } from '../../components/core/Modal.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { Translate } from '../../components/core/Translate.js';
import { getQueryParams, RouterEvents, setQueryParams } from '../../components/core/Router.js';
import { s } from '../../components/core/VanillaJs.js';
import { DefaultService } from './default.service.js';

const logger = loggerFactory(import.meta);

const DefaultOptions = {
  idModal: 'modal-default-management',
  serviceId: 'default-management',
  entity: 'default',
  columnDefs: [
    { field: '0', headerName: '0' },
    { field: '1', headerName: '1' },
    { field: '2', headerName: '2' },
    { field: 'createdAt', headerName: 'createdAt', cellDataType: 'date', editable: false },
    { field: 'updatedAt', headerName: 'updatedAt', cellDataType: 'date', editable: false },
  ],
  defaultColKeyFocus: '0',
  ServiceProvider: DefaultService,
  permissions: {
    add: true,
    remove: true,
  },
};

const columnDefFormatter = (obj, columnDefs, customFormat) => {
  for (const colDef of columnDefs)
    switch (colDef.cellDataType) {
      case 'date':
        obj[colDef.field] = obj[colDef.field] ? new Date(obj[colDef.field]) : new Date();
        break;
      case 'boolean':
        if (obj[colDef.field] !== true && obj[colDef.field] !== false) obj[colDef.field] = false;
      default:
        break;
    }
  return customFormat ? customFormat(obj) : obj;
};

const DefaultManagement = {
  Tokens: {},
  loadTable: async function (id, options = { reload: true }) {
    const { serviceId, columnDefs, customFormat } = this.Tokens[id];
    const result = await this.Tokens[id].ServiceProvider.get({
      page: this.Tokens[id].page,
      limit: this.Tokens[id].limit,
      id: this.Tokens[id].serviceOptions?.get?.id ?? undefined,
    });
    if (result.status === 'success') {
      const { data, total, page, totalPages } = result.data;
      this.Tokens[id].total = total;
      this.Tokens[id].page = page;
      this.Tokens[id].totalPages = totalPages;
      const rowDataScope = data.map((row) => columnDefFormatter(row, columnDefs, customFormat));
      if (options.reload) AgGrid.grids[this.Tokens[id].gridId].setGridOption('rowData', rowDataScope);
      const paginationComp = s(`#ag-pagination-${this.Tokens[id].gridId}`);
      paginationComp.setAttribute('current-page', this.Tokens[id].page);
      paginationComp.setAttribute('total-pages', this.Tokens[id].totalPages);
      paginationComp.setAttribute('total-items', this.Tokens[id].total);
    }
  },
  RenderTable: async function (options = DefaultOptions) {
    if (!options) options = DefaultOptions;
    const { serviceId, columnDefs, entity, defaultColKeyFocus, ServiceProvider, permissions } = options;
    logger.info('DefaultManagement RenderTable', options);
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    const queryParams = getQueryParams();
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;
    this.Tokens[id] = {
      ...options,
      gridId,
      page,
      limit,
      total: 0,
      totalPages: 1,
    };

    setQueryParams({ page, limit });
    setTimeout(async () => {
      // https://www.ag-grid.com/javascript-data-grid/data-update-transactions/

      class RemoveActionGridRenderer {
        eGui;
        tokens;

        async init(params) {
          this.eGui = document.createElement('div');
          this.tokens = {};
          const { rowIndex } = params;
          const { createdAt, updatedAt } = params.data;

          const cellRenderId = getId(this.tokens, `${serviceId}-`);
          this.tokens[cellRenderId] = {};

          this.eGui.innerHTML = html` ${await BtnIcon.Render({
            label: html`<div class="abs center">
              <i class="fas fa-times"></i>
            </div> `,
            class: `in fll section-mp management-table-btn-mini management-table-btn-remove-${id}-${cellRenderId}`,
          })}`;
          setTimeout(() => {
            EventsUI.onClick(
              `.management-table-btn-remove-${id}-${cellRenderId}`,
              async () => {
                const confirmResult = await Modal.RenderConfirm({
                  html: async () => {
                    return html`
                      <div class="in section-mp" style="text-align: center">
                        ${Translate.Render('confirm-delete-item')}
                        ${Object.keys(params.data).length > 0
                          ? html`<br />
                              "${options.defaultColKeyFocus
                                ? getValueFromJoinString(params.data, options.defaultColKeyFocus)
                                : params.data[Object.keys(params.data)[0]]}"`
                          : ''}
                      </div>
                    `;
                  },
                  id: `delete-${params.data._id}`,
                });
                if (confirmResult.status !== 'confirm') return;
                let result;
                if (params.data._id) result = await ServiceProvider.delete({ id: params.data._id });
                else result = { status: 'success' };

                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : Translate.Render('item-success-delete'),
                  status: result.status,
                });
                if (result.status === 'success') {
                  AgGrid.grids[gridId].applyTransaction({ remove: [params.data] });
                  const token = DefaultManagement.Tokens[id];
                  // if we are on the last page and we delete the last item, go to the previous page
                  const newTotal = token.total - 1;
                  const newTotalPages = Math.ceil(newTotal / token.limit);
                  if (token.page > newTotalPages && newTotalPages > 0) {
                    token.page = newTotalPages;
                  }

                  // reload the current page
                  await DefaultManagement.loadTable(id, { reload: false });
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

      AgGrid.grids[gridId].setGridOption(
        'columnDefs',
        columnDefs.concat(
          permissions.remove
            ? [
                {
                  field: 'remove-action',
                  headerName: '',
                  width: 100,
                  cellRenderer: RemoveActionGridRenderer,
                  editable: false,
                },
              ]
            : [],
        ),
      );
      DefaultManagement.loadTable(id);
      // {
      //   const result = await ServiceProvider.get();
      //   if (result.status === 'success') {
      //     rowDataScope = result.data.map((row) => columnDefFormatter(row, columnDefs, options.customFormat));
      //     AgGrid.grids[gridId].setGridOption('rowData', rowDataScope);
      //   }
      // }
      s(`.management-table-btn-save-${id}`).onclick = () => {
        AgGrid.grids[gridId].stopEditing();
      };
      EventsUI.onClick(`.management-table-btn-add-${id}`, async () => {
        const rowObj = {};
        for (const def of columnDefs) {
          rowObj[def.field] = '';
        }
        // const result = await ServiceProvider.post({ body: rowObj });
        const result = {
          status: 'success',
          data: rowObj,
        };
        // NotificationManager.Push({
        //   html: result.status === 'error' ? result.message : `${Translate.Render('success-create-item')}`,
        //   status: result.status,
        // });
        if (result.status === 'success') {
          AgGrid.grids[gridId].applyTransaction({
            add: [columnDefFormatter(rowObj, columnDefs, options.customFormat)],
            addIndex: 0,
          });
          // AgGrid.grids[gridId].applyTransaction({
          //   add: [columnDefFormatter(result.data, columnDefs, options.customFormat)],
          //   addIndex: 0,
          // });
          // AgGrid.grids[gridId].applyColumnState({
          //   state: [
          //     // { colId: 'country', sort: 'asc', sortIndex: 1 },
          //     { colId: 'updatedAt', sort: 'desc', sortIndex: 0 },
          //   ],
          //   defaultState: { sort: null },
          // });
        } else {
          // AgGrid.grids[gridId].applyColumnState({
          //   defaultState: { sort: null },
          // });
        }

        // https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/

        const pinned = undefined;
        const key = undefined;

        // setFocusedCell = (
        //   rowIndex: number,
        //   colKey: string  |  Column,
        //   rowPinned?: RowPinnedType
        // ) => void;

        // type RowPinnedType =
        //       'top'
        //     | 'bottom'
        //     | null
        //     | undefined

        AgGrid.grids[gridId].setFocusedCell(0, '0', pinned);

        // interface StartEditingCellParams {
        //   // The row index of the row to start editing
        //   rowIndex: number;
        //   // The column key of the row to start editing
        //   colKey: string  |  Column;
        //   // Set to `'top'` or `'bottom'` to start editing a pinned row
        //   rowPinned?: RowPinnedType;
        //   // The key to pass to the cell editor
        //   key?: string;
        // }

        setTimeout(() => {
          AgGrid.grids[gridId].startEditingCell({
            rowIndex: 0,
            colKey: defaultColKeyFocus,
            rowPinned: pinned,
            key: key,
          });
        });
      });
      EventsUI.onClick(`.management-table-btn-clean-${id}`, async () => {
        const confirmResult = await Modal.RenderConfirm(
          {
            html: async () => {
              return html`
                <div class="in section-mp" style="text-align: center;">
                  <strong>${Translate.Render('confirm-delete-all-data')}</strong>
                </div>
              `;
            },
            id: `clean-table-${id}`,
          },
          { context: 'modal' },
        );
        if (confirmResult.status === 'cancelled') return;
        const result = await ServiceProvider.delete();
        NotificationManager.Push({
          html: result.status === 'error' ? result.message : Translate.Render('success-delete-all-items'),
          status: result.status,
        });
        if (result.status === 'success') {
          DefaultManagement.loadTable(id);
        }
      });
      s(`#ag-pagination-${gridId}`).addEventListener('page-change', async (event) => {
        const token = DefaultManagement.Tokens[id];
        token.page = event.detail.page;
        await DefaultManagement.loadTable(id);
      });
      s(`#ag-pagination-${gridId}`).addEventListener('limit-change', async (event) => {
        const token = DefaultManagement.Tokens[id];
        token.limit = event.detail.limit;
        token.page = 1; // Reset to first page
        await DefaultManagement.loadTable(id);
      });
      RouterEvents[id] = async (...args) => {
        const queryParams = getQueryParams();
        const page = parseInt(queryParams.page) || 1;
        const limit = parseInt(queryParams.limit) || 10;
        const token = DefaultManagement.Tokens[id];

        // Check if the pagination state in the URL is different from the current state
        if (token.page !== page || token.limit !== limit) {
          token.page = page;
          token.limit = limit;
          // Reload the table with the new pagination state from the URL
          await DefaultManagement.loadTable(id);
        }
      };
    }, 1);
    return html`<div class="fl">
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-add-${id} ${
            permissions.add ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-add-${id}-label"><i class="fa-solid fa-circle-plus"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-save-${id} ${
            permissions.add ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-save-${id}-label"><i class="fas fa-save"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-clean-${id} ${
            permissions.remove ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-clean-${id}-label"><i class="fas fa-broom"></i></div> `,
          type: 'button',
        })}
      </div>
      <div class="in section-mp">
        ${await AgGrid.Render({
          id: gridId,
          parentModal: options.idModal,
          usePagination: true,
          darkTheme,
          gridOptions: {
            defaultColDef: {
              flex: 1,
              editable: true,
              cellDataType: false,
              minWidth: 100,
              filter: true,
              autoHeight: true,
            },
            editType: 'fullRow',
            // rowData: [],
            onCellValueChanged: async (...args) => {
              console.log('onCellValueChanged', args);
              // field: event.colDef.field,
              // body[event.colDef.field] = event.newValue;
              // NotificationManager.Push({
              //   html:
              //     result.status === 'error'
              //       ? result.message
              //       : `${Translate.Render('field')} ${event.colDef.headerName} ${Translate.Render('success-updated')}`,
              //   status: result.status,
              // });
            },
            rowSelection: 'single',
            onSelectionChanged: async (...args) => {
              console.log('onSelectionChanged', args);
              const [event] = args;
              const selectedRows = AgGrid.grids[gridId].getSelectedRows();
              logger.info('selectedRows', selectedRows);
            },
            onRowValueChanged: async (...args) => {
              const [event] = args;
              logger.info('onRowValueChanged', args);
              let result;
              if (options.onRowValueChanged) {
                const { status, data, message } = await options.onRowValueChanged(...args);
                if (status === 'success' && data) event.data = data;
                else {
                  NotificationManager.Push({
                    html: message,
                    status,
                  });
                  return;
                }
              }
              if (!event.data._id) {
                result = await ServiceProvider.post({ body: event.data });
                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : `${Translate.Render('success-create-item')}`,
                  status: result.status,
                });
                if (result.status === 'success') {
                  this.Tokens[id].page = 1;
                  await DefaultManagement.loadTable(id);
                  // const newItemId = result.data?.[entity]?._id || result.data?._id;
                  // The `event.node.id` is the temporary ID assigned by AG Grid.
                  // const rowNode = AgGrid.grids[gridId].getRowNode(event.node.id);
                  setQueryParams({ page: 1, limit: this.Tokens[id].limit });

                  let rowNode;
                  AgGrid.grids[gridId].forEachLeafNode((_rowNode) => {
                    if (_rowNode.data._id === result.data._id) {
                      rowNode = _rowNode;
                    }
                  });
                  if (rowNode) {
                    const newRow = columnDefFormatter(result.data, columnDefs, options.customFormat);
                    // Add a temporary flag to the new row data.
                    newRow._new = true;
                    // Update the row data with the data from the server, which includes the new permanent `_id`.
                    rowNode.setData(newRow);
                    // The `rowClassRules` will automatically apply the 'row-new-highlight' class.
                    // Now, remove the flag after a delay to remove the highlight.
                    // setTimeout(() => {
                    //   delete newRow._new;
                    //   rowNode.setData(newRow);
                    // }, 2000);
                  }
                }
              } else {
                const body = event.data ? event.data : {};
                result = await ServiceProvider.put({ id: event.data._id, body });
                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : `${Translate.Render('success-update-item')}`,
                  status: result.status,
                });
                if (result.status === 'success') {
                  AgGrid.grids[gridId].applyTransaction({
                    update: [event.data],
                  });
                  DefaultManagement.loadTable(id, { reload: false });
                }
              }
            },
          },
        })}
      </div>`;
  },
};

export { DefaultManagement };
