import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
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
  { field: 'createdAt', headerName: 'createdAt', editable: false },
  { field: 'updatedAt', headerName: 'updatedAt', editable: false },
];

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
        AgGrid.grids[gridId].setGridOption('rowData', result.data);
      }

      EventsUI.onClick(`.management-table-btn-add-${id}`, async () => {
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
          AgGrid.grids[gridId].applyTransaction({ add: [result.data] });
        }
      });
    }, 1);
    return html`<div class="fl">
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn management-table-btn-add-${id}`,
          label: html`<i class="fa-solid fa-circle-plus"></i>`,
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
