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
    { server: 'interior32', port: 4004, status: 'online' },
  ],
  Render: async function (options = { idModal: '', events: {} }) {
    const id = options?.idModal ? options.idModal : getId(this.Tokens, 'server-cyberia-');
    this.Tokens[id] = {
      events: {},
    };
    if (options && options.events)
      this.Tokens[id].events = {
        ...this.Tokens[id].events,
        ...options.events,
      };

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
            const keyEvents = Object.keys(ServerCyberiaPortal.Tokens[id].events);
            if (keyEvents.length > 0) {
              for (const keyEvent of keyEvents)
                await ServerCyberiaPortal.Tokens[id].events[keyEvent]({ server: `/${server}` });
              if (s(`.btn-close-modal-server`)) s(`.btn-close-modal-server`).click();
              return;
            }
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
