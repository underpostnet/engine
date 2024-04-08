// https://www.ag-grid.com/javascript-data-grid/getting-started/
// https://www.ag-grid.com/javascript-data-grid/themes/

import { append, getProxyPath, s } from './VanillaJs.js';
import * as agGrid from 'ag-grid-community';

const AgGrid = {
  grids: {},
  changeTheme: function ({ darkTheme }) {
    for (const idGrid of Object.keys(this.grids)) {
      if (s(`.${idGrid}`)) {
        s(`.${idGrid}`).classList.remove(darkTheme ? this.theme : this.theme + '-dark');
        s(`.${idGrid}`).classList.add(!darkTheme ? this.theme : this.theme + '-dark');
      } else console.warn('change theme: grid not found');
    }
  },
  Render: async function (options) {
    let { id } = options;
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
        // rowHeight: 60,
        enableCellChangeFlash: true,
        defaultColDef: {
          editable: false,
          flex: 1,
          minWidth: 50,
          filter: true,
          autoHeight: true,
        },
        // domLayout: 'autoHeight', || 'normal'
        // Column Definitions: Defines & controls grid columns.
        columnDefs: options?.gridOptions?.rowData?.[0]
          ? Object.keys(options.gridOptions.rowData[0]).map((field) => {
              return { field };
            })
          : [],
        ...options.gridOptions,
      };

      // Your Javascript code to create the grid
      const myGridElement = s(`.${id}`);
      this.grids[id] = agGrid.createGrid(myGridElement, gridOptions);
      // myGridElement.style.setProperty('width', '100%');
    });
    return html`
      <div
        class="${id} ${this.theme}${options?.darkTheme ? `-dark` : ''}"
        style="${options?.style
          ? Object.keys(options.style).map((styleKey) => `${styleKey}: ${options.style[styleKey]}; `)
          : 'height: 500px'}"
      ></div>
    `;
  },
};

export { AgGrid };
