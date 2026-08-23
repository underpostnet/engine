import { EventSchedulerService } from '../../services/event-scheduler/event-scheduler.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { isValidDate, newInstance, range, s4 } from './CommonJs.js';
import { renderCssAttr } from './Css.js';
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { Panel } from './Panel.js';
import { Responsive } from './Responsive.js';
import { listenQueryPathInstance, RouterEvents, setQueryPath, getQueryParams } from './Router.js';
import { Translate } from './Translate.js';
import { append, getTimeZone, htmls, s } from './VanillaJs.js';
// https://fullcalendar.io/docs/event-object
const daysOfWeekOptions = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const eventDateFactory = (event) =>
  newInstance({
    event: { ...event.extendedProps, title: event.title },
    start: event.start,
    end: event.end,
  });
class CalendarCore {
  static async RenderStyle() {}
  static Data = {};
  static async instance(options = { idModal: '', appStore: {}, hiddenDates: [] }) {
    CalendarCore.Data[options.idModal] = {
      data: [],
      originData: [],
      filesData: [],
      calendar: {},
      hiddenDates: options.hiddenDates ? options.hiddenDates : [],
    };
    const titleIcon = html`<i class="fas fa-calendar-alt"></i>`;
    const getPanelData = async () => {
      const result = await EventSchedulerService.get({
        id: `${getQueryParams().cid ? getQueryParams().cid : Auth.getToken() ? 'creatorUser' : ''}`,
      });
      NotificationManager.Push({
        html: result.status === 'success' ? Translate.instance('success-get-events-scheduler') : result.message,
        status: result.status,
      });
      if (result.status === 'success') {
        const resultData = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        CalendarCore.Data[options.idModal].filesData = [];
        CalendarCore.Data[options.idModal].originData = newInstance(resultData);
        CalendarCore.Data[options.idModal].data = resultData.map((o) => {
          if (o.creatorUserId && options.appStore.Data.user.main.model.user._id === o.creatorUserId) o.tools = true;
          o.id = o._id;
          CalendarCore.Data[options.idModal].filesData.push({});
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
    const calendarLocaleOptions = () => ({
      todayText: Translate.text('today'),
      monthText: Translate.text('month'),
      weekTextLong: Translate.text('week'),
      listText: Translate.text('summary'),
    });
    const renderCalendar = (events) => {
      const calendarEl = s(`.calendar-${idPanel}`);
      if (!calendarEl) return;
      CalendarCore.Data[options.idModal].calendar?.destroy?.();
      CalendarCore.Data[options.idModal].calendar = new FullCalendar.Calendar(calendarEl, {
        allDaySlot: false,
        // initialView: 'dayGridWeek',
        timeZone: getTimeZone(),
        locale: s('html')?.lang || 'en',
        ...calendarLocaleOptions(),
        events: events ?? [],
        initialView: 'dayGridMonth',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek',
        },
        eventClick: async function (args) {
          args.jsEvent?.preventDefault();
          const dateData = eventDateFactory(args.event);
          // element -> args.el
          // remove all events associated ->  args.event.remove();
          // console.error('eventClick', JSON.stringify(dateData, null, 4));
          if (options.eventClick) return await options.eventClick(dateData, args);
          const eventId = dateData.event._id || args.event.id;
          if (!eventId || !options.route) return;
          setQueryPath({ path: options.route, queryPath: eventId });
          if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
          s(`.calendar-container-${options.idModal}`)?.classList.add('hide');
          s(`.main-body-calendar-${options.idModal}`)?.classList.remove('hide');
          await CalendarCore.Data[options.idModal].updatePanel();
        },
        eventClass: function (args) {
          if (!args.event.extendedProps._id) return 'hide';
          const dateData = eventDateFactory(args.event);
          if (
            new Date(dateData.start).getTime() <= new Date().getTime() ||
            CalendarCore.Data[options.idModal].hiddenDates.find(
              (d) => d.eventSchedulerId === dateData.event._id && d.date === dateData.start,
            )
          )
            return 'hide';
          return '';
        },
      });
      CalendarCore.Data[options.idModal].calendar.render();
    };
    setTimeout(() => {
      renderCalendar();
      const applyFullCalendarLang = () => {
        const calendar = CalendarCore.Data[options.idModal].calendar;
        if (!calendar?.setOption) return;
        calendar.setOption('locale', s('html')?.lang || 'en');
        for (const [name, value] of Object.entries(calendarLocaleOptions())) calendar.setOption(name, value);
      };
      Translate.onChanged(applyFullCalendarLang, { key: 'fullcalendar-lang' });
      applyFullCalendarLang();
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
      const closeButton = s(`.close-calendar-container-${options.idModal}`);
      if (!closeButton) return;
      closeButton.onclick = () => {
        s(`.calendar-container-${options.idModal}`)?.classList.add('hide');
        s(`.main-body-calendar-${options.idModal}`)?.classList.remove('hide');
      };
    });
    const panelRender = async () => {
      return html`${await Panel.instance({
          idPanel,
          parentIdModal: options.idModal,
          formData,
          data: CalendarCore.Data[options.idModal].data,
          formContainerClass: '',
          scrollClassContainer: `main-body-calendar-${options.idModal}`,
          role: options.role,
          originData: () => CalendarCore.Data[options.idModal].originData,
          filesData: () => CalendarCore.Data[options.idModal].filesData,
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
              label: html`<i class="fa-regular fa-calendar-days"></i> ${Translate.instance('calendar')}`,
              onClick: function () {
                s(`.calendar-container-${options.idModal}`)?.classList.remove('hide');
                s(`.main-body-calendar-${options.idModal}`)?.classList.add('hide');
                CalendarCore.Data[options.idModal].calendar.setOption('height', 700);
                CalendarCore.Data[options.idModal].calendar.render();
                Translate.emitChanged({ lang: s('html').lang });
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
                      ? Translate.instance('success-edit-event-scheduler')
                      : Translate.instance('success-add-event-scheduler')
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
                      ${Translate.instance('confirm-delete-item')}
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
    CalendarCore.Data[options.idModal].updatePanel = async () => {
      const cid = getQueryParams().cid ? getQueryParams().cid : '';
      if (lastCid === cid) return;
      lastCid = cid;
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
          await CalendarCore.Data[idPanel].updatePanel();
        };
    }
    return html`
      <div class="in main-body-calendar-${options.idModal}">${await panelRender()}</div>
      <style>
        .calendar-container-${options.idModal} {
          color: black;
          background: #fcfcfc;
          --fc-classic-background: #fcfcfc;
          --fc-classic-button: #b1b1b1;
          --fc-classic-button-border: transparent;
          --fc-classic-button-strong: #4a4a4a;
          --fc-classic-button-strong-border: transparent;
        }

        .calendar-container-${options.idModal} a {
          color: #4a4a4a;
          cursor: pointer;
        }
        .calendar-container-${options.idModal} a:hover {
          color: #8a8a8a;
        }

        .calendar-${idPanel} {
          min-height: 700px;
          padding: 0 10px 10px;
        }

        .calendar-buttons-container {
          padding-bottom: 15px;
          height: 60px;
        }
      </style>
      <div class="in calendar-container calendar-container-${options.idModal} hide">
        <div class="in modal calendar-buttons-container">
          ${await BtnIcon.instance({
            class: `inl section-mp btn-custom close-calendar-container-${options.idModal} flr`,
            label: html`<i class="fa-solid fa-xmark"></i> ${Translate.instance('close')}`,
            type: 'button',
          })}
        </div>
        <div class="in"><div class="calendar-${idPanel}"></div></div>
      </div>
    `;
  }
}
export { CalendarCore };
