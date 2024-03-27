import { D3Chart } from '../core/D3Chart.js';

const DashboardNexodev = {
  Render: async function () {
    return html` ${await D3Chart.Render()} `;
  },
};

export { DashboardNexodev };
