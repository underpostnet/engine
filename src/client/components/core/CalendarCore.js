import { append, s } from './VanillaJs.js';

const CalendarCore = {
  RenderStyle: async function () {
    append(`head`, html`<style></style>`);
  },
  Render: async function () {
    setTimeout(() => {
      const calendarEl = s('#calendar');
      const calendar = new FullCalendar.Calendar(calendarEl, {
        plugins: [FullCalendar.DayGrid.default],
        initialView: 'dayGridMonth',
        events: [{ title: 'Meeting', start: new Date() }],
      });

      calendar.render();
    });
    return html` <div id="calendar"></div>`;
  },
};

export { CalendarCore };
