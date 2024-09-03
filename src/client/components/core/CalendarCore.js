import { Translate } from './Translate.js';
import { append, getTimeZone, htmls, s, sa } from './VanillaJs.js';

const CalendarCore = {
  RenderStyle: async function () {},
  Render: async function () {
    setTimeout(() => {
      const calendarEl = s('#calendar');
      const calendar = new FullCalendar.Calendar(calendarEl, {
        plugins: [FullCalendar.DayGrid.default, FullCalendar.TimeGrid.default, FullCalendar.List.default],
        // initialView: 'dayGridWeek',
        timeZone: getTimeZone(),
        dateClick: function (arg) {
          console.error('calendar dateClick', arg.date.toString());
        },
        events: [{ title: 'Meeting', start: new Date() }],
        initialView: 'dayGridMonth',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek',
        },
      });

      calendar.render();

      Translate.Event['fullcalendar-lang'] = () => {
        calendar.setOption('locale', s(`html`).lang);
        if (s(`.fc-timegrid-axis-cushion`)) htmls(`.fc-timegrid-axis-cushion`, Translate.Render('all-day'));
      };
      setTimeout(() => {
        Translate.Event['fullcalendar-lang']();

        s(`.fc-timeGridWeek-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
      });

      sa(`.fc-button-group`)[1].style.float = 'right';
    });
    return html` <style>
        .calendar-container {
          color: black;
          background: #fcfcfc;
        }

        .calendar-container a {
          color: #6d68ff;
          cursor: pointer;
        }
        .calendar-container a:hover {
          color: #8682ee;
        }

        .fc-toolbar-title {
          font-size: 20px !important;
          margin: 0px !important;
          text-transform: uppercase;
          color: #6d68ff;
          padding: 10px 5px 5px 5px;
        }

        .fc-button-primary {
          background: #6d68ff !important;
          color: white;
        }

        .fc-button-primary:active {
          background: #5d039d !important;
          color: white;
        }

        .fc-toolbar {
          display: block !important;
        }

        .fc-toolbar-chunk {
          padding: 5px;
        }
      </style>
      <div class="in section-mp calendar-container"><div id="calendar"></div></div>`;
  },
};

export { CalendarCore };
