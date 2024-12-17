import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { darkTheme } from '../core/Css.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { CyberiaServer } from '../cyberia/CommonCyberia.js';
import { MainUserCyberia } from '../cyberia/MainUserCyberia.js';
import { SocketIoCyberia } from '../cyberia/SocketIoCyberia.js';

const ServerCyberiaPortal = {
  Tokens: {},
  instances: CyberiaServer.instances,
  Render: async function (options = { idModal: '', events: {} }) {
    const id = options?.idModal ? options.idModal : getId(this.Tokens, 'server-cyberia-');
    this.Tokens[id] = {
      events: {},
    };
    if (options && options.events)
      for (const keyEvent of Object.keys(options.events)) this.Tokens[id].events[keyEvent] = options.events[keyEvent];

    class LoadGridServerActionsRenderer {
      eGui;

      async init(params) {
        this.eGui = document.createElement('div');
        const { server, status, port } = params.data;

        this.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<i class="fas fa-play-circle"></i>`,
          class: `btn-server-${server}-${id}`,
        })}`;
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
    const gridId = `server-grid-${id}`;
    return html` ${await AgGrid.Render({
      id: gridId,
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
        rowSelection: 'single',
        onSelectionChanged: async (event) => {
          const selectedRows = AgGrid.grids[gridId].getSelectedRows();
          console.log('selectedRows', { gridId, event, selectedRows });
          const keyEvents = Object.keys(ServerCyberiaPortal.Tokens[id].events);
          if (keyEvents.length > 0) {
            for (const keyEvent of keyEvents)
              await ServerCyberiaPortal.Tokens[id].events[keyEvent]({ server: selectedRows[0].server });
          }
        },
      },
    })}`;
  },
  internalChangeServer: async (options = { server: '' }) => {
    s(`.ssr-loading-bar`).style.display = 'flow-root';
    htmls(`.ssr-play-btn-container`, '');
    await SocketIoCyberia.changeServer(options?.server ? options : undefined);
    await MainUserCyberia.finishSetup();
  },
};

export { ServerCyberiaPortal };
