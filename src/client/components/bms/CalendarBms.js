import { CalendarCore } from '../core/CalendarCore.js';

const CalendarBms = {
  Render: async function (options) {
    return html`${await CalendarCore.Render(options)}`;
  },
};

export { CalendarBms };
