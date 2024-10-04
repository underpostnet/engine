import { EventSchedulerService } from '../../services/event-scheduler/event-scheduler.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance, range, s4 } from './CommonJs.js';
import { renderCssAttr } from './Css.js';
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { Panel } from './Panel.js';
import { Responsive } from './Responsive.js';
import { listenQueryPathInstance, RouterEvents, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { append, getQueryParams, getTimeZone, htmls, s, sa } from './VanillaJs.js';

// https://fullcalendar.io/docs/event-object

const CalendarCore = {
  RenderStyle: async function () {},
  Data: {},
  Render: async function (options = { idModal: '', Elements: {}, heightTopBar: 50, heightBottomBar: 50 }) {
    this.Data[options.idModal] = {
      data: [],
      originData: [],
      filesData: [],
      calendar: {},
    };

    const { heightTopBar, heightBottomBar } = options;

    const titleIcon = html`<i class="fas fa-calendar-alt"></i>`;

    const getSrrData = () => {
      this.Data[options.idModal].data = range(0, 5).map((i) => {
        return {
          id: `event-${i}`,
          description: `Event ${s4()}${s4()}${s4()}`,
          start: new Date().toTimeString(),
          end: new Date().toTimeString(),
        };
      });
    };
    getSrrData();

    const dateFormat = (date) =>
      html`<span
        style="${renderCssAttr({
          style: {
            'font-size': '14px',
            color: '#888',
          },
        })}"
        >${new Date(date).toLocaleString().replaceAll(',', '')}</span
      >`;

    const getPanelData = async () => {
      const result = await EventSchedulerService.get({
        id: `${getQueryParams().cid ? getQueryParams().cid : 'creatorUser'}`,
      });
      NotificationManager.Push({
        html: result.status === 'success' ? Translate.Render('success-get-events-scheduler') : result.message,
        status: result.status,
      });
      if (result.status === 'success') {
        const resultData = Array.isArray(result.data) ? result.data : [result.data];
        this.Data[options.idModal].filesData = [];
        this.Data[options.idModal].originData = newInstance(resultData);
        this.Data[options.idModal].data = resultData.map((o) => {
          if (o.creatorUserId && options.Elements.Data.user.main.model.user._id === o.creatorUserId) o.tools = true;
          o.id = o._id;
          o.start = dateFormat(o.start);
          o.end = dateFormat(o.end);
          this.Data[options.idModal].filesData.push({});
          return o;
        });
      }
    };

    const renderCalendar = () => {
      const calendarEl = s(`.calendar-${idPanel}`);
      this.Data[options.idModal].calendar = new FullCalendar.Calendar(calendarEl, {
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
        id: 'description',
        model: 'description',
        inputType: 'text',
        rules: [{ type: 'isEmpty' }],
        panel: { type: 'title' },
      },
      {
        id: 'allDay',
        model: 'allDay',
        inputType: 'checkbox-on-off',
        rules: [],
        panel: { type: 'info-row', icon: html`<i class="fa-solid fa-infinity"></i>` },
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

    setTimeout(() => {
      const resizeModal = () => {
        Modal.Data[options.idModal].onObserverListener[options.idModal] = () => {
          if (s(`.main-body-calendar-${options.idModal}`))
            s(`.main-body-calendar-${options.idModal}`).style.height = `${
              s(`.${options.idModal}`).offsetHeight - Modal.headerTitleHeight
            }px`;
        };
        Modal.Data[options.idModal].onObserverListener[options.idModal]();
      };
      setTimeout(resizeModal);
      RouterEvents[`${options.idModal}-main-body`] = ({ route }) => {
        if (route === 'calendar') {
          setTimeout(() => {
            resizeModal();
          }, 400);
        }
      };

      s(`.close-calendar-container`).onclick = () => {
        s(`.calendar-container`).classList.add('hide');
        s(`.main-body-calendar-${options.idModal}`).classList.remove('hide');
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
          originData: () => this.Data[options.idModal].originData,
          filesData: () => this.Data[options.idModal].filesData,
          onClick: async function ({ payload }) {
            if (options.route) {
              setQueryPath({ path: options.route, queryPath: payload._id });
              if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
              if (CalendarCore.Data[options.idModal].updatePanel)
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
          on: {
            add: async function ({ data, editId }) {
              const {
                status,
                message,
                data: documentData,
              } = editId
                ? await EventSchedulerService.put({ id: editId, body: { ...data, _id: undefined } })
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
                data.start = dateFormat(data.start);
                data.end = dateFormat(data.end);
                data.tools = true;
                data._id = documentData._id;

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
                if (CalendarCore.Data[options.idModal].updatePanel)
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

                if (getQueryParams().cid === data.id) {
                  setQueryPath({ path: options.route, queryPath: '' });
                  if (CalendarCore.Data[options.idModal].updatePanel)
                    await CalendarCore.Data[options.idModal].updatePanel();
                }

                return { status };
              }
              return { status: 'error' };
            },
          },
        })}
        <div class="in" style="margin-bottom: 100px"></div>`;
    };

    let lastCid;
    let lasUserId;
    this.Data[options.idModal].updatePanel = async () => {
      const cid = getQueryParams().cid ? getQueryParams().cid : '';
      if (lastCid === cid && lasUserId === options.Elements.Data.user.main.model.user._id) return;
      if (options.route === 'home') Modal.homeCid = newInstance(cid);
      lasUserId = newInstance(options.Elements.Data.user.main.model.user._id);
      lastCid = cid;
      if (s(`.main-body-calendar-${options.idModal}`)) {
        if (Auth.getToken()) await getPanelData();
        else getSrrData();
        htmls(`.main-body-calendar-${options.idModal}`, await panelRender());
      }
    };

    if (options.route)
      listenQueryPathInstance({
        id: options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body',
        routeId: options.route,
        event: async (path) => {
          setTimeout(() => {
            CalendarCore.Data[options.idModal].updatePanel();
          });
        },
      });

    if (options.route === 'home') setTimeout(CalendarCore.Data[options.idModal].updatePanel);

    return html`
      <style>
        .main-body-calendar-${options.idModal} {
          overflow: auto;
        }
        .${idPanel}-form {
          max-width: 750px !important;
        }
      </style>
      <div class="style-calendar">
        <style>
          .modal-calendar {
            overflow: hidden;
          }
        </style>
      </div>

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
          top: ${Modal.headerTitleHeight}px;
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
        <div class="in"><div class="calendar-${idPanel}"></div></div>
      </div>
    `;
  },
};

export { CalendarCore };
