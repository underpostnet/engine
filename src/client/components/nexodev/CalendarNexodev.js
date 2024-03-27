import { CalendarCore } from '../core/CalendarCore.js';

const CalendarNexodev = {
  Render: async function () {
    return html`${await CalendarCore.Render()}`;
  },
};

export { CalendarNexodev };
