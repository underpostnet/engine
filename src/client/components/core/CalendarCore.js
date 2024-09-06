import { BtnIcon } from './BtnIcon.js';
import { range, s4 } from './CommonJs.js';
import { Modal } from './Modal.js';
import { Panel } from './Panel.js';
import { Responsive } from './Responsive.js';
import { Translate } from './Translate.js';
import { append, getTimeZone, htmls, s, sa } from './VanillaJs.js';

// https://fullcalendar.io/docs/event-object

const CalendarCore = {
  RenderStyle: async function () {},
  Render: async function (options = { idModal: '' }) {
    let calendar;
    const renderCalendar = () => {
      const calendarEl = s('#calendar');
      calendar = new FullCalendar.Calendar(calendarEl, {
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
    };
    setTimeout(() => {
      renderCalendar();
      Translate.Event['fullcalendar-lang'] = () => {
        calendar.setOption('locale', s(`html`).lang);
        if (s(`.fc-timegrid-axis-cushion`)) htmls(`.fc-timegrid-axis-cushion`, Translate.Render('all-day'));
        if (s(`.fc-dayGridMonth-button`)) htmls(`.fc-dayGridMonth-button`, Translate.Render('month'));
        if (s(`.fc-timeGridWeek-button`)) htmls(`.fc-timeGridWeek-button`, Translate.Render('week'));
        if (s(`.fc-listWeek-button`)) htmls(`.fc-listWeek-button`, Translate.Render('summary'));
        if (s(`.fc-today-button`)) htmls(`.fc-today-button`, Translate.Render('today'));
      };
      setTimeout(() => {
        Translate.Event['fullcalendar-lang']();
        s(`.fc-dayGridMonth-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
        s(`.fc-listWeek-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
        s(`.fc-timeGridWeek-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
        s(`.fc-next-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
        s(`.fc-prev-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
        s(`.fc-today-button`).onclick = () => {
          Translate.Event['fullcalendar-lang']();
        };
      });

      sa(`.fc-button-group`)[1].style.float = 'right';
    });

    const idPanel = 'calendar-panel';
    const formData = [
      {
        model: 'id',
        id: 'id',
        inputType: 'text',
        disableRender: true,
        rules: [{ type: 'isEmpty' }],
      },
      {
        id: 'description',
        model: 'description',
        inputType: 'text',
        rules: [{ type: 'isEmpty' }],
        panel: { type: 'title' },
      },
      {
        id: 'start',
        model: 'start',
        inputType: 'datetime-local',
        panel: { type: 'subtitle' },
      },
      {
        id: 'end',
        model: 'end',
        inputType: 'datetime-local',
        panel: { type: 'info-row' },
      },
    ];

    const data = range(0, 5).map((i) => {
      return {
        id: `event-${i}`,
        description: `Event ${s4()}${s4()}${s4()}`,
        start: new Date().toTimeString(),
        end: new Date().toTimeString(),
      };
    });
    const heightTopBar = 100;
    const heightBottomBar = 0;

    setTimeout(() => {
      Modal.Data[options.idModal].onObserverListener[options.idModal] = () => {
        if (s(`.main-body-calendar`))
          s(`.main-body-calendar`).style.height = `${s(`.${options.idModal}`).offsetHeight - 110}px`;
      };
      Modal.Data[options.idModal].onObserverListener[options.idModal]();

      s(`.close-calendar-container`).onclick = () => {
        s(`.calendar-container`).classList.add('hide');
        s(`.main-body-calendar`).classList.remove('hide');
        htmls(
          `.style-calendar`,
          html`<style>
            .modal-calendar {
              overflow: hidden;
            }
          </style>`,
        );
      };
    });

    return html`
      <style>
        .main-body-calendar {
          overflow: auto;
        }
      </style>
      <div class="style-calendar">
        <style>
          .modal-calendar {
            overflow: hidden;
          }
        </style>
      </div>

      <div class="in main-body-calendar">
        ${await Panel.Render({
          idPanel,
          formData,
          heightTopBar,
          heightBottomBar,
          data,
          scrollClassContainer: 'main-body-calendar',
          titleIcon: html`<i class="fas fa-calendar-alt"></i>`,
          callBackPanelRender: async function ({ data, imgRender, htmlRender }) {
            return await htmlRender({
              render: html`<div class="abs center">
                <i class="far fa-calendar" style="font-size: 130px; color: #d3d3d3cf;"></i>
              </div>`,
            });
          },
          customButtons: [
            {
              label: html`<i class="fa-regular fa-calendar-days"></i> ${Translate.Render('calendar')}`,
              onClick: function () {
                s(`.calendar-container`).classList.remove('hide');
                s(`.main-body-calendar`).classList.add('hide');
                // renderCalendar();
                calendar.setOption('height', 700);
                Translate.Event['fullcalendar-lang']();
                htmls(
                  `.style-calendar`,
                  html`<style>
                    .modal-calendar {
                      overflow: auto;
                    }
                  </style>`,
                );
              },
            },
          ],
        })}
        <div class="in" style="margin-bottom: 100px"></div>
      </div>
      <style>
        .calendar-container {
          color: black;
          background: #fcfcfc;
        }

        .calendar-container a {
          color: #4a4a4a;
          cursor: pointer;
        }
        .calendar-container a:hover {
          color: #8a8a8a;
        }

        .fc-toolbar-title {
          font-size: 20px !important;
          margin: 0px !important;
          text-transform: uppercase;
          color: #8a8a8a;
          padding: 10px 5px 5px 5px;
        }

        .fc-button,
        .fc-button-primary {
          border: none !important;
          border-radius: 0px !important;
          background: #b1b1b1 !important;
          margin: 3px !important;
          /* color: #4a4a4a; */
        }

        .fc-button-primary:hover,
        .fc-button:hover {
          background: #4a4a4a !important;
          /* background: #b1b1b1 !important; */
          /* box-shadow: none !important;
  border-radius: 0px !important;
  border: none !important; */
        }

        .fc-button-primary:active .fc-button:active {
          /* box-shadow: none !important;
  border-radius: 0px !important;
  border: none !important; */
        }

        .fc-toolbar {
          display: block !important;
        }

        .fc-toolbar-chunk {
          padding: 5px;
        }

        .calendar-buttons-container {
          padding-bottom: 15px;
          top: 100px;
          height: 60px;
          z-index: 4;
        }
      </style>
      <div class="in calendar-container hide">
        <div class="stq modal calendar-buttons-container">
          ${await BtnIcon.Render({
            class: `section-mp btn-custom close-calendar-container flr`,
            label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
            type: 'button',
          })}
        </div>
        <div class="in"><div id="calendar"></div></div>
      </div>
    `;
  },
};

export { CalendarCore };
