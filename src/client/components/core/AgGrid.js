// https://www.ag-grid.com/javascript-data-grid/getting-started/
// https://www.ag-grid.com/javascript-data-grid/themes/

import { append, getProxyPath, s } from './VanillaJs.js';
import * as agGrid from 'ag-grid-community';

const AgGrid = {
  grids: {},
  Render: async function (options) {
    let { id, data } = options;
    if (!data) data = [];
    if (!this.theme) {
      this.theme = `ag-theme-alpine`; // quartz
      append(
        'head',
        html`<link
            rel="stylesheet"
            type="text/css"
            href="${getProxyPath()}styles/ag-grid-community/ag-grid.min.css"
          /><link
            rel="stylesheet"
            type="text/css"
            href="${getProxyPath()}styles/ag-grid-community/${this.theme}.min.css"
          />`,
      );
    }
    setTimeout(() => {
      // Grid Options: Contains all of the grid configurations
      const gridOptions = {
        // Row Data: The data to be displayed.
        rowHeight: 60,
        rowData: data,
        // Column Definitions: Defines & controls grid columns.
        columnDefs: data[0]
          ? Object.keys(data[0]).map((field) => {
              return { field };
            })
          : [],
      };

      // Your Javascript code to create the grid
      const myGridElement = s(`.${id}`);
      this.grids[id] = agGrid.createGrid(myGridElement, gridOptions);
      // myGridElement.style.setProperty('width', '100%');
    });
    return html` <div class="${id} ${this.theme}-dark" style="height: 500px"></div> `;
  },
};

export { AgGrid };
