import { CalendarCore } from '../core/CalendarCore.js';

const CalendarNexodev = {
  Render: async function (options) {
    return html`${await CalendarCore.Render(options)}`;
  },
};

export { CalendarNexodev };
