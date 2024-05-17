import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { darkTheme } from '../core/Css.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const ServerCyberiaPortal = {
  Tokens: {},
  instances: [
    { server: 'dim32', port: 4002, status: 'online' },
    { server: 'hhworld', port: 4003, status: 'online' },
  ],
  Render: async function () {
    const id = getId(this.Tokens, 'server-cyberia-');

    class LoadGridServerActionsRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { server, status, port } = params.data;

        this.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<i class="fas fa-play-circle" style="color: #ffcc00"></i>`,
          class: `btn-server-${server}-${id}`,
        })}`;

        setTimeout(() => {
          s(`.btn-server-${server}-${id}`).onclick = () => {
            const { protocol, hostname } = window.location;
            location.href = `${protocol}//${hostname}/${server}`;
          };
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    class LoadGridServerNameRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { server, status, port } = params.data;

        this.eGui.innerHTML = html`<img
            class="inl server-icon"
            src="${getProxyPath()}assets/ui-icons/world-default-forest-city.png"
          />
          ${server}`;

        setTimeout(() => {});
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    class LoadGridServerStatusRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { server, status, port } = params.data;

        this.eGui.innerHTML = html`online <span class="server-status-circle">●</span>`;

        setTimeout(() => {});
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }
    return html` ${await AgGrid.Render({
      id: `server-grid-${id}`,
      darkTheme,
      // style: {
      //   height: '200px',
      // },
      gridOptions: {
        defaultColDef: {
          editable: false,
          minWidth: 100,
          filter: true,
          autoHeight: true,
        },
        rowData: this.instances,
        columnDefs: [
          { field: 'server', flex: 2, headerName: 'server', cellRenderer: LoadGridServerNameRenderer },
          { field: 'status', flex: 1, headerName: 'status', cellRenderer: LoadGridServerStatusRenderer },
          { headerName: 'play', width: 100, cellRenderer: LoadGridServerActionsRenderer },
        ],
      },
    })}`;
  },
};

export { ServerCyberiaPortal };
