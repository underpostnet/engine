import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { timer } from '../../components/core/CommonJs.js';
import { darkTheme } from '../../components/core/Css.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { Translate } from '../../components/core/Translate.js';
import { s } from '../../components/core/VanillaJs.js';
import { DefaultService } from './default.service.js';

const logger = loggerFactory(import.meta);

const serviceId = 'default-management';
const entity = 'default';
const columnDefs = [
  { field: '0', headerName: '0' },
  { field: '1', headerName: '1' },
  { field: '2', headerName: '2' },
  { field: 'createdAt', headerName: 'createdAt', cellDataType: 'date', editable: false },
  { field: 'updatedAt', headerName: 'updatedAt', cellDataType: 'date', editable: false },
];

const columnDefFormatter = (obj) => {
  for (const colDef of columnDefs)
    switch (colDef.cellDataType) {
      case 'date':
        obj[colDef.field] = new Date(obj[colDef.field]);
        break;
      default:
        break;
    }

  return obj;
};

const DefaultManagement = {
  Tokens: {},
  RenderTable: async function (options = { idModal: '' }) {
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    this.Tokens[id] = { gridId };

    setTimeout(async () => {
      // https://www.ag-grid.com/javascript-data-grid/data-update-transactions/

      // AgGrid.grids[gridId].applyTransaction({ remove: [params.data] });

      AgGrid.grids[gridId].setGridOption('columnDefs', columnDefs);
      {
        const result = await DefaultService.get();
        AgGrid.grids[gridId].setGridOption(
          'rowData',
          result.data.reverse().map((row) => columnDefFormatter(row)),
        );
      }
      s(`.management-table-btn-save-${id}`).onclick = () => {
        AgGrid.grids[gridId].stopEditing();
      };
      EventsUI.onClick(`.management-table-btn-add-${id}`, async () => {
        s(`.btn-add-${id}-label`).classList.add('hide');
        const rowObj = {};
        for (const def of columnDefs) {
          rowObj[def.field] = '';
        }
        const result = await DefaultService.post({ body: rowObj });
        NotificationManager.Push({
          html: result.status === 'error' ? result.message : result.status,
          status: result.status,
        });
        if (result.status === 'success') {
          AgGrid.grids[gridId].applyTransaction({ add: [columnDefFormatter(result.data)], addIndex: 0 });
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

        s(`.btn-add-${id}-label`).classList.remove('hide');

        AgGrid.grids[gridId].startEditingCell({
          rowIndex: 0,
          colKey: '0',
          rowPinned: pinned,
          key: key,
        });
      });
    }, 1);
    return html`<div class="fl">
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn management-table-btn-add-${id}`,
          label: html`<div class="abs center btn-add-${id}-label"><i class="fa-solid fa-circle-plus"></i></div>`,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn management-table-btn-save-${id}`,
          label: html`<div class="abs center btn-save-${id}-label"><i class="fas fa-save"></i></div>`,
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
            },
            editType: 'fullRow',
            // rowData: [],
            onCellValueChanged: async (...args) => {
              console.log('onCellValueChanged', args);
              const [event] = args;
              logger.info('onCellValueChanged', {
                field: event.colDef.field,
                value: event.newValue,
                data: event.data,
              });
              const body = {};
              body[event.colDef.field] = event.newValue;
              const result = await DefaultService.put({ id: event.data._id, body });
              NotificationManager.Push({
                html: result.status === 'error' ? result.message : result.status,
                status: result.status,
              });
              if (result.status === 'success') {
                AgGrid.grids[gridId].applyTransaction({ update: [columnDefFormatter(event.data)] });
              }
            },
            // onRowValueChanged: (...args) => {
            //   console.log('onRowValueChanged', args);
            // },
          },
        })}
      </div>`;
  },
};

export { DefaultManagement };
