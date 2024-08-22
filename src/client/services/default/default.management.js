import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { darkTheme } from '../../components/core/Css.js';
import { s } from '../../components/core/VanillaJs.js';

const serviceId = 'default-management';

const DefaultManagement = {
  Tokens: {},
  RenderTable: async function (options = { idModal: '' }) {
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    this.Tokens[id] = { gridId };

    setTimeout(() => {
      // https://www.ag-grid.com/javascript-data-grid/data-update-transactions/

      // AgGrid.grids[gridId].applyTransaction({ remove: [params.data] });

      const columnDefs = [
        { field: '0', headerName: '0' },
        { field: '1', headerName: '1' },
        { field: '2', headerName: '2' },
        { field: 'createdAt', headerName: 'createdAt', editable: false },
        { field: 'updatedAt', headerName: 'updatedAt', editable: false },
      ];

      AgGrid.grids[gridId].setGridOption('columnDefs', columnDefs);

      s(`.management-table-btn-add-${id}`).onclick = () => {
        const rowObj = {};
        for (const def of columnDefs) {
          rowObj[def.field] = '';
        }
        AgGrid.grids[gridId].applyTransaction({ add: [rowObj] });
      };
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
            rowData: [],
            onCellValueChanged: (...args) => {
              console.log('onCellValueChanged', args);
              const [event] = args;
              console.log({
                field: event.colDef.field,
                value: event.newValue,
                data: event.data,
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
