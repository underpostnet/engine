import { CalendarCore } from '../core/CalendarCore.js';

const CalendarHealthcare = {
  Render: async function (options) {
    return html`${await CalendarCore.Render(options)}`;
  },
};

export { CalendarHealthcare };
