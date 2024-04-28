import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { darkTheme } from '../core/Css.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

class LoadGridServerActionsRenderer {
  eGui;

  async init(params) {
    this.eGui = document.createElement('div');
    const { server, status, port } = params.data;

    this.eGui.innerHTML = html` ${await BtnIcon.Render({
      label: html`<i class="fas fa-play-circle" style="color: #ffcc00"></i>`,
      class: `btn-server-${server}`,
    })}`;

    setTimeout(() => {
      s(`.btn-server-${server}`).onclick = () => {
        location.href = location.port
          ? `http://localhost:${port}/${server}`
          : `https://www.cyberiaonline.com/${server}`;
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

const ServerCyberiaPortal = {
  instances: [
    { server: 'dim32', port: 4002, status: 'online' },
    { server: 'hhworld', port: 4003, status: 'online' },
  ],
  Render: async function () {
    return html` ${await AgGrid.Render({
      id: 'server-grid',
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
