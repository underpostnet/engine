import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { darkTheme } from '../core/Css.js';
import { getProxyPath, s } from '../core/VanillaJs.js';
import { CyberiaServer } from '../cyberia/CommonCyberia.js';

const ServerCyberiaAdmin = {
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

        setTimeout(() => {
          s(`.btn-server-${server}-${id}`).onclick = async () => {
            const keyEvents = Object.keys(ServerCyberiaAdmin.Tokens[id].events);
            if (keyEvents.length > 0) {
              for (const keyEvent of keyEvents) await ServerCyberiaAdmin.Tokens[id].events[keyEvent]({ server });
              if (s(`.btn-close-modal-server`)) s(`.btn-close-modal-server`).click();
            }
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

export { ServerCyberiaAdmin };
