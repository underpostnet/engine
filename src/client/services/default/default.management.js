import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { getId, getValueFromJoinString, timer } from '../../components/core/CommonJs.js';
import { darkTheme } from '../../components/core/Css.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { Modal } from '../../components/core/Modal.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { Translate } from '../../components/core/Translate.js';
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
  RenderTable: async function (options = DefaultOptions) {
    if (!options) options = DefaultOptions;
    const { serviceId, columnDefs, entity, defaultColKeyFocus, ServiceProvider, permissions } = options;
    logger.info('DefaultManagement RenderTable', options);
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    this.Tokens[id] = { gridId };

    setTimeout(async () => {
      // https://www.ag-grid.com/javascript-data-grid/data-update-transactions/

      let rowDataScope = [];

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
      {
        const result = await ServiceProvider.get();
        if (result.status === 'success') {
          rowDataScope = result.data.map((row) => columnDefFormatter(row, columnDefs, options.customFormat));
          AgGrid.grids[gridId].setGridOption('rowData', rowDataScope);
        }
      }
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
            add: [columnDefFormatter(result.data, columnDefs, options.customFormat)],
            addIndex: 0,
          });
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
          AgGrid.grids[gridId].setGridOption('rowData', []);
        }
      });
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
                  event.data._id = result.data[entity] ? result.data[entity]._id : result.data._id;
                }
              } else {
                const body = event.data ? event.data : {};
                result = await ServiceProvider.put({ id: event.data._id, body });
                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : `${Translate.Render('success-update-item')}`,
                  status: result.status,
                });
              }
              if (result.status === 'success') {
                AgGrid.grids[gridId].applyTransaction({
                  update: [event.data],
                });
              }
            },
          },
        })}
      </div>`;
  },
};

export { DefaultManagement };
