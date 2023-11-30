// https://www.ag-grid.com/javascript-data-grid/getting-started/
// https://www.ag-grid.com/javascript-data-grid/themes/

import { append, getProxyPath, s } from './VanillaJs.js';
import * as agGrid from 'ag-grid-community';

const AgGrid = {
  grids: {},
  Render: function (id) {
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
        rowData: [
          {
            mission: 'Voyager',
            company: 'NASA',
            location: 'Cape Canaveral',
            date: '1977-09-05',
            rocket: 'Titan-Centaur ',
            price: 86580000,
            successful: true,
          },
          {
            mission: 'Apollo 13',
            company: 'NASA',
            location: 'Kennedy Space Center',
            date: '1970-04-11',
            rocket: 'Saturn V',
            price: 3750000,
            successful: false,
          },
          {
            mission: 'Falcon 9',
            company: 'SpaceX',
            location: 'Cape Canaveral',
            date: '2015-12-22',
            rocket: 'Falcon 9',
            price: 9750000,
            successful: true,
          },
        ],
        // Column Definitions: Defines & controls grid columns.
        columnDefs: [
          { field: 'mission' },
          { field: 'company' },
          { field: 'location' },
          { field: 'date' },
          { field: 'price' },
          { field: 'successful' },
          { field: 'rocket' },
        ],
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
