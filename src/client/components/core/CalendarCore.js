import { s } from './VanillaJs.js';

const CalendarCore = {
  Render: async function () {
    setTimeout(() => {
      const container = s('#calendar');

      /** @type {import('@toast-ui/calendar').Options} */
      const options = {
        defaultView: 'week',
        timezone: {
          zones: [
            {
              timezoneName: 'Asia/Seoul',
              displayLabel: 'Seoul',
            },
            {
              timezoneName: 'Europe/London',
              displayLabel: 'London',
            },
          ],
        },
        calendars: [
          {
            id: 'cal1',
            name: 'Personal',
            backgroundColor: '#03bd9e',
          },
          {
            id: 'cal2',
            name: 'Work',
            backgroundColor: '#00a9ff',
          },
        ],
      };
      /** @type {import('@toast-ui/calendar').default} */
      const Calendar = tui.Calendar;
      this.instance = new Calendar(container, options);
    });
    return html`<div id="calendar"></div>`;
  },
};

export { CalendarCore };
