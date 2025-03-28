import { EventSchedulerService } from '../../services/event-scheduler/event-scheduler.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { isValidDate, newInstance, range, s4 } from './CommonJs.js';
import { renderCssAttr } from './Css.js';
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { Panel } from './Panel.js';
import { Responsive } from './Responsive.js';
import { listenQueryPathInstance, RouterEvents, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { append, getQueryParams, getTimeZone, htmls, s, sa } from './VanillaJs.js';

// https://fullcalendar.io/docs/event-object

const daysOfWeekOptions = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const eventDateFactory = (event) =>
  newInstance({
    event: { ...event.extendedProps, title: event._def.title },
    start: event.start,
    end: event.end,
  });

const CalendarCore = {
  RenderStyle: async function () {},
  Data: {},
  Render: async function (
    options = { idModal: '', Elements: {}, heightTopBar: 50, heightBottomBar: 50, hiddenDates: [] },
  ) {
    this.Data[options.idModal] = {
      data: [],
      originData: [],
      filesData: [],
      calendar: {},
      hiddenDates: options.hiddenDates ? options.hiddenDates : [],
    };

    const { heightTopBar, heightBottomBar } = options;

    const titleIcon = html`<i class="fas fa-calendar-alt"></i>`;

    const getPanelData = async () => {
      const result = await EventSchedulerService.get({
        id: `${getQueryParams().cid ? getQueryParams().cid : Auth.getToken() ? 'creatorUser' : ''}`,
      });
      NotificationManager.Push({
        html: result.status === 'success' ? Translate.Render('success-get-events-scheduler') : result.message,
        status: result.status,
      });
      if (result.status === 'success') {
        const resultData = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        this.Data[options.idModal].filesData = [];
        this.Data[options.idModal].originData = newInstance(resultData);
        this.Data[options.idModal].data = resultData.map((o) => {
          if (o.creatorUserId && options.Elements.Data.user.main.model.user._id === o.creatorUserId) o.tools = true;
          o.id = o._id;

          this.Data[options.idModal].filesData.push({});
          return o;
        });
        setTimeout(() => {
          renderCalendar(
            resultData.map((o) => {
              // FREQ=WEEKLY;
              // if (o.daysOfWeek && o.daysOfWeek.length > 0) {
              //   o.rrule = `RRULE:BYDAY=${o.daysOfWeek.map((d) => `${d[0]}${d[1]}`.toUpperCase()).join(',')}`;
              // }
              // o.rrule = 'FREQ=WEEKLY;BYDAY=SU;BYHOUR=10,11;COUNT=10';
              if (o.daysOfWeek && o.daysOfWeek.length > 0)
                o.daysOfWeek = o.daysOfWeek.map((v, i) => daysOfWeekOptions.indexOf(v));
              else delete o.daysOfWeek;
              // o.exdate = ['2024-04-02'];
              // delete o.end;
              // delete o.start;

              return o;
            }),
          );
        });
      }
    };

    const renderCalendar = (events) => {
      const calendarEl = s(`.calendar-${idPanel}`);
      this.Data[options.idModal].calendar = new FullCalendar.Calendar(calendarEl, {
        allDaySlot: false,
        plugins: [
          FullCalendar.DayGrid.default,
          FullCalendar.TimeGrid.default,
          FullCalendar.List.default,
          // https://fullcalendar.io/docs/rrule-plugin
          FullCalendar.RRule.default,
        ],
        // initialView: 'dayGridWeek',
        timeZone: getTimeZone(),
        dateClick: function (arg) {
          console.error('calendar dateClick', arg.date.toString());
        },
        events: events ?? [{ title: 'Meeting', start: new Date() }],
        initialView: 'dayGridMonth',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek',
        },
        eventClick: async function (args) {
          const dateData = eventDateFactory(args.event);
          // element -> args.el
          // remove all events associated ->  args.event.remove();
          // console.error('eventClick', JSON.stringify(dateData, null, 4));
          if (options.eventClick) await options.eventClick(dateData, args);
        },
        eventClassNames: function (args) {
          // console.error('eventClassNames', JSON.stringify(dateData, null, 4));
          if (!args.event.extendedProps._id) return args.event.remove();
          const dateData = eventDateFactory(args.event);
          if (
            new Date(dateData.start).getTime() <= new Date().getTime() ||
            CalendarCore.Data[options.idModal].hiddenDates.find(
              (d) => d.eventSchedulerId === dateData.event._id && d.date === dateData.start,
            )
          )
            return ['hide'];
        },
      });

      this.Data[options.idModal].calendar.render();
    };
    setTimeout(() => {
      renderCalendar();
      Translate.Event['fullcalendar-lang'] = () => {
        this.Data[options.idModal].calendar.setOption('locale', s(`html`).lang);
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

    const idPanel = `calendar-panel-${options.idModal}`;
    const formData = [
      {
        model: 'id',
        id: 'id',
        inputType: 'text',
        disableRender: true,
        rules: [{ type: 'isEmpty' }],
      },
      {
        id: 'title',
        model: 'title',
        inputType: 'text',
        rules: [{ type: 'isEmpty' }],
        panel: { type: 'title' },
      },
      {
        id: 'description',
        model: 'description',
        inputType: 'text',
        rules: [{ type: 'isEmpty' }],
        panel: { type: 'info-row' },
      },
      {
        id: 'start',
        model: 'start',
        inputType: 'datetime-local',
        translateCode: 'startTime',
        panel: { type: 'info-row' },
      },
      {
        id: 'end',
        model: 'end',
        inputType: 'datetime-local',
        translateCode: 'endTime',
        panel: { type: 'info-row' },
      },
      {
        id: 'daysOfWeek',
        model: 'daysOfWeek',
        inputType: 'dropdown-checkbox',
        dropdown: {
          options: daysOfWeekOptions,
        },
        panel: { type: 'list' },
      },
      {
        id: 'startTime',
        model: 'startTime',
        inputType: 'time',
        panel: { type: 'info-row' },
      },
      {
        id: 'endTime',
        model: 'endTime',
        inputType: 'time',
        panel: { type: 'info-row' },
      },
    ];

    setTimeout(() => {
      s(`.close-calendar-container`).onclick = () => {
        s(`.calendar-container`).classList.add('hide');
        s(`.main-body-calendar-${options.idModal}`).classList.remove('hide');
      };
    });

    const panelRender = async () => {
      return html`${await Panel.Render({
          idPanel,
          parentIdModal: options.idModal,
          formData,
          heightTopBar,
          heightBottomBar,
          data: this.Data[options.idModal].data,
          formContainerClass: '',
          scrollClassContainer: `main-body-calendar-${options.idModal}`,
          role: options.role,
          originData: () => this.Data[options.idModal].originData,
          filesData: () => this.Data[options.idModal].filesData,
          onClick: async function ({ payload }) {
            if (options.route) {
              setQueryPath({ path: options.route, queryPath: payload._id });
              if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
              await CalendarCore.Data[options.idModal].updatePanel();
            }
          },
          titleIcon,
          route: 'calendar',
          callBackPanelRender: async function ({ data, fileRender, htmlRender }) {
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
                s(`.main-body-calendar-${options.idModal}`).classList.add('hide');
                // renderCalendar();
                CalendarCore.Data[options.idModal].calendar.setOption('height', 700);
                Translate.Event['fullcalendar-lang']();
              },
            },
          ],
          on: {
            add: async function ({ data, editId }) {
              if (data.daysOfWeek && data.daysOfWeek.length > 0 && daysOfWeekOptions[data.daysOfWeek[0]]) {
                data.daysOfWeek = data.daysOfWeek.map((d) => daysOfWeekOptions[d]);
              }
              data.timeZoneClient = getTimeZone();
              const {
                status,
                message,
                data: documentData,
              } = editId
                ? await EventSchedulerService.put({
                    id: editId,
                    body: { ...data, _id: undefined },
                  })
                : await EventSchedulerService.post({ body: data });
              NotificationManager.Push({
                html:
                  status === 'success'
                    ? editId
                      ? Translate.Render('success-edit-event-scheduler')
                      : Translate.Render('success-add-event-scheduler')
                    : message,
                status: status,
              });

              if (status === 'success') {
                documentData.tools = true;
                // data._id = documentData._id;
                data = documentData;

                let originObj, indexOriginObj;
                let filesData = {};
                if (editId) {
                  indexOriginObj = CalendarCore.Data[options.idModal].originData.findIndex((d) => d._id === editId);
                  if (indexOriginObj > -1) originObj = CalendarCore.Data[options.idModal].originData[indexOriginObj];
                }
                if (originObj) {
                  CalendarCore.Data[options.idModal].originData[indexOriginObj] = documentData;
                  CalendarCore.Data[options.idModal].data[indexOriginObj] = data;
                  CalendarCore.Data[options.idModal].filesData[indexOriginObj] = filesData;
                } else {
                  CalendarCore.Data[options.idModal].originData.push(documentData);
                  CalendarCore.Data[options.idModal].data.push(data);
                  CalendarCore.Data[options.idModal].filesData.push(filesData);
                }

                setQueryPath({ path: options.route, queryPath: documentData._id });
                if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
                await CalendarCore.Data[options.idModal].updatePanel();
              }
              return { data, status, message };
            },
            remove: async function ({ e, data }) {
              e.preventDefault();
              const confirmResult = await Modal.RenderConfirm({
                html: async () => {
                  return html`
                    <div class="in section-mp" style="text-align: center">
                      ${Translate.Render('confirm-delete-item')}
                      <br />
                      "${data.description}"
                    </div>
                  `;
                },
                id: `delete-${idPanel}`,
              });
              if (confirmResult.status === 'confirm') {
                const { status, message } = await EventSchedulerService.delete({
                  id: data._id,
                });
                NotificationManager.Push({
                  html: status,
                  status,
                });

                setQueryPath({ path: options.route, queryPath: '' });
                await CalendarCore.Data[options.idModal].updatePanel();

                return { status };
              }
              return { status: 'error' };
            },
          },
        })}
        <div class="in" style="margin-bottom: 100px"></div>`;
    };

    let lastCid;
    this.Data[options.idModal].updatePanel = async () => {
      const cid = getQueryParams().cid ? getQueryParams().cid : '';
      if (lastCid === cid) return;
      lastCid = cid;
      if (options.route === 'home') Modal.homeCid = newInstance(cid);
      if (s(`.main-body-calendar-${options.idModal}`)) {
        // if (Auth.getToken())
        // else getSrrData();
        await getPanelData();
        htmls(`.main-body-calendar-${options.idModal}`, await panelRender());
      }
    };

    if (options.route) {
      listenQueryPathInstance({
        id: options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body',
        routeId: options.route,
        event: async (path) => {
          CalendarCore.Data[options.idModal].updatePanel();
        },
      });
      if (!options.parentIdModal)
        Modal.Data['modal-menu'].onHome[idPanel] = async () => {
          lastCid = undefined;
          setQueryPath({ path: options.route, queryPath: '' });
          await this.Data[idPanel].updatePanel();
        };
    }
    return html`
      <div class="in main-body-calendar-${options.idModal}">${await panelRender()}</div>
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
          height: 60px;
          z-index: 4;
        }
      </style>
      <div class="in calendar-container hide">
        <div class="in modal calendar-buttons-container">
          ${await BtnIcon.Render({
            class: `inl section-mp btn-custom close-calendar-container flr`,
            label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
            type: 'button',
          })}
        </div>
        <div class="in"><div class="calendar-${idPanel}"></div></div>
      </div>
    `;
  },
};

export { CalendarCore };
