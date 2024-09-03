import { s } from './VanillaJs.js';

const CalendarCore = {
  Render: async function () {
    setTimeout(() => {
      const calendarEl = s('#calendar');
      const calendar = new FullCalendar.Calendar(calendarEl, {
        // plugins: [dayGridPlugin],
        initialView: 'dayGridMonth',
        events: [{ title: 'Meeting', start: new Date() }],
      });

      calendar.render();
    });
    return html` <div id="calendar"></div>`;
  },
};

export { CalendarCore };
