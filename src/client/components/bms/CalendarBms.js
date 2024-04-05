import { CalendarCore } from '../core/CalendarCore.js';

const CalendarBms = {
  Render: async function () {
    return html`${await CalendarCore.Render()}`;
  },
};

export { CalendarBms };
