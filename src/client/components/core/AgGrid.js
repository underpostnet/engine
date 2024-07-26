// https://www.ag-grid.com/javascript-data-grid/getting-started/
// https://www.ag-grid.com/javascript-data-grid/themes/

import { ThemeEvents, darkTheme } from './Css.js';
import { append, getProxyPath, htmls, s } from './VanillaJs.js';
import * as agGrid from 'ag-grid-community';

const AgGrid = {
  grids: {},
  theme: `ag-theme-alpine`, // quartz
  Render: async function (options) {
    let { id } = options;
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
      if (this.grids[id]) this.grids[id].destroy();
      this.grids[id] = agGrid.createGrid(myGridElement, gridOptions);
      // myGridElement.style.setProperty('width', '100%');
      ThemeEvents[id] = () => {
        if (s(`.${id}`)) {
          s(`.${id}`).classList.remove(darkTheme ? this.theme : this.theme + '-dark');
          s(`.${id}`).classList.add(!darkTheme ? this.theme : this.theme + '-dark');
        } else {
          // console.warn('change theme: grid not found');
          delete ThemeEvents[id];
        }
      };
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
  RenderStyle: async function (
    options = {
      eventThemeId: 'AgGrid',
      style: {
        'font-family': '',
        'font-size': '',
        'no-cell-focus-style': false,
        'row-cursor': '',
      },
    },
  ) {
    /*
     --ag-foreground-color: rgb(126, 46, 132);
     --ag-background-color: rgb(249, 245, 227);
     --ag-header-foreground-color: rgb(204, 245, 172);
     --ag-header-background-color: rgb(209, 64, 129);
     --ag-odd-row-background-color: rgb(0, 0, 0, 0.03);
     --ag-header-column-resize-handle-color: rgb(126, 46, 132);

     --ag-font-size: 17px;
     */
    if (!s(`.ag-grid-base-style`))
      append(
        'head',
        html`<link
            class="ag-grid-base-style"
            rel="stylesheet"
            type="text/css"
            href="${getProxyPath()}styles/ag-grid-community/ag-grid.min.css"
          /><link
            rel="stylesheet"
            type="text/css"
            href="${getProxyPath()}styles/ag-grid-community/${this.theme}.min.css"
          />`,
      );
    ThemeEvents[options.eventThemeId] = () => {
      htmls(
        `.ag-grid-style`,
        html` ${options.style['font-family']
            ? html`<style>
                .ag-theme-alpine,
                .ag-theme-alpine-dark {
                  --ag-font-family: '{{ag-font-family}}';
                }
              </style>`.replaceAll('{{ag-font-family}}', options.style['font-family'])
            : ''}
          ${options.style['font-size']
            ? html`<style>
                .ag-theme-alpine,
                .ag-theme-alpine-dark {
                  --ag-font-size: '{{ag-font-size}}';
                }
              </style>`.replaceAll('{{ag-font-size}}', options.style['font-size'])
            : ''}
          ${options.style['no-cell-focus-style']
            ? html`<style>
                .ag-has-focus .ag-cell-focus {
                  border: none !important;
                }
              </style>`
            : ''}
          ${options.style['row-cursor']
            ? html`<style>
                .ag-row {
                  cursor: '{{ag-row-cursor}}';
                }
              </style>`.replaceAll(`'{{ag-row-cursor}}'`, options.style['row-cursor'])
            : ''}

          <style>
            .ag-btn-renderer {
              font-size: 16px;
              min-width: 90px;
              min-height: 90px;
            }
          </style>
          ${darkTheme
            ? html`
                <style>
                  .ag-cell-data-changed,
                  .ag-cell-data-changed-animation {
                    background-color: #6d68ff !important;
                    background: #6d68ff !important;
                    color: #e4e4e4 !important;
                  }
                </style>
              `
            : html`<style>
                .ag-cell-data-changed,
                .ag-cell-data-changed-animation {
                  background-color: #d1d1d1 !important;
                  background: #d1d1d1 !important;
                  color: #2e2e2e !important;
                }
              </style>`}`,
      );
    };
  },
};

export { AgGrid };
