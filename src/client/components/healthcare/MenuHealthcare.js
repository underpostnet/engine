import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { commonModeratorGuard, getId, newInstance, range } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';
import Sortable from 'sortablejs';
import { RouterHealthcare } from './RoutesHealthcare.js';
import { SettingsHealthcare } from './SettingsHealthcare.js';
import { DropDown } from '../core/DropDown.js';
import { loggerFactory } from '../core/Logger.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { PanelForm } from '../core/PanelForm.js';
import { MenuHomeHealthcare, NutritionalTips } from './CommonHealthcare.js';
import { CalendarCore } from '../core/CalendarCore.js';
import { Scroll } from '../core/Scroll.js';
import { AppointmentFormHealthcare } from './AppointmentFormHealthCare.js';
import { HealthcareAppointmentService } from '../../services/healthcare-appointment/healthcare-appointment.service.js';
import { NotificationManager } from '../core/NotificationManager.js';

const logger = loggerFactory(import.meta);

const MenuHealthcare = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterHealthcare();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-settings',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-home"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="home"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-in',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-in-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-sign-up',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-plus"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('sign-up')}</span>`,
            }),
            attrs: `data-id="sign-up"`,
            tabHref: `${getProxyPath()}sign-up`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('sign-up')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-out',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-out-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('log-out')}</span>`,
            }),
            attrs: `data-id="log-out"`,
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-out')),
            style: 'display: none',
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-account',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-circle"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('account')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="account"`,
            tabHref: `${getProxyPath()}account`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('account')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-recover hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('recover')}</span>`,
            }),
            attrs: `data-id="recover"`,
            tabHref: `${getProxyPath()}recover`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('recover')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-nutrition-tips hide',
            label: renderMenuLabel({
              icon: html`<img
                class="slide-menu-icon"
                src="${getProxyPath()}${MenuHomeHealthcare['nutrition-tips'].icon}"
              />`,
              text: html`<span class="inl menu-label-text menu-label-text-slide-menu-icon"
                >${Translate.Render('nutrition-tips')}</span
              >`,
            }),
            attrs: `data-id="nutrition-tips"`,
            tabHref: `${getProxyPath()}nutrition-tips`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('nutrition-tips')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-calendar',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-calendar-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('healthcare-appointment')}</span>
                <!-- ${Translate.Render('calendar')} --->`,
            }),
            attrs: `data-id="calendar"`,
            tabHref: `${getProxyPath()}calendar`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('calendar')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-healthcare-appointment hide',
            label: renderMenuLabel({
              icon: html` <i class="fas fa-medkit"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('healthcare-appointment')}</span>`,
            }),
            attrs: `data-id="healthcare-appointment"`,
            tabHref: `${getProxyPath()}healthcare-appointment`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('healthcare-appointment', 'right')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}android-chrome-192x192.png`;
          htmls(
            '.action-btn-app-icon-render',
            html`<img class="inl top-bar-app-icon ${!darkTheme ? '' : 'negative-color'}" src="${srcLogo}" />`,
          );
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      heightTopBar,
      heightBottomBar,
      htmlMainBody: async () => {
        setTimeout(() => {
          Modal.Data['main-body'].onObserverListener['observer'] = () => {
            if (s(`.main-body`).offsetWidth < 170 * 4) {
              htmls(
                `.style-home-menu-container`,
                html` <style>
                  .home-menu-container {
                    width: ${170 * 2}px;
                  }
                </style>`,
              );

              return;
            }
            htmls(
              `.style-home-menu-container`,
              html` <style>
                .home-menu-container {
                  width: ${170 * 4}px;
                }
              </style>`,
            );
          };
          EventsUI.onClick(`.home-body-btn-${'nutrition-tips'}`, () => {
            s(`.main-btn-${'nutrition-tips'}`).click();
          });
          ThemeEvents['banner'] = () => {
            if (darkTheme) s(`.healthcare-banner`).classList.add('negative-color');
            else s(`.healthcare-banner`).classList.remove('negative-color');
          };
          ThemeEvents['banner']();
        });
        let render = '';
        for (const routeId of Object.keys(MenuHomeHealthcare)) {
          const { icon } = MenuHomeHealthcare[routeId];
          render += html`${await BtnIcon.Render({
            label: html`<div class="abs center" style="top: 30%">
                <img class="inl home-menu-icon no-drag" src="${getProxyPath()}${icon}" />
              </div>
              <div class="abs center" style="top: 75%">${Translate.Render(routeId)}</div>`,
            class: `in fll home-body-btn home-body-btn-${routeId}`,
          })}`;
        }
        return html`
          <div class="style-home-menu-container">
            <style>
              .home-menu-container {
                max-width: ${170 * 4}px;
              }
            </style>
          </div>
          <div class="fl home-menu-container">
            <div class="in home-h1-font-container">
              <img class="in healthcare-banner" src="${getProxyPath()}assets/icons/23.png" />
              <br />
              ${Translate.Render('¿')}${Translate.Render('home-getting')}
            </div>
            ${render}
          </div>
        `;
      },
    });

    this.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
      animation: 150,
      group: `menu-sortable`,
      forceFallback: true,
      fallbackOnBody: true,
      handle: '.handle-btn-container',
      store: {
        /**
         * Get the order of elements. Called once during initialization.
         * @param   {Sortable}  sortable
         * @returns {Array}
         */
        get: function (sortable) {
          const order = localStorage.getItem(sortable.options.group.name);
          return order ? order.split('|') : [];
        },

        /**
         * Save the order of elements. Called onEnd (when the item is dropped).
         * @param {Sortable}  sortable
         */
        set: function (sortable) {
          const order = sortable.toArray();
          localStorage.setItem(sortable.options.group.name, order.join('|'));
        },
      },
      // chosenClass: 'css-class',
      // ghostClass: 'css-class',
      // Element dragging ended
      onEnd: function (/**Event*/ evt) {
        // console.log('Sortable onEnd', evt);
        // console.log('evt.oldIndex', evt.oldIndex);
        // console.log('evt.newIndex', evt.newIndex);
        const slotId = Array.from(evt.item.classList).pop();
        // console.log('slotId', slotId);
        if (evt.oldIndex === evt.newIndex) s(`.${slotId}`).click();

        // var itemEl = evt.item; // dragged HTMLElement
        // evt.to; // target list
        // evt.from; // previous list
        // evt.oldIndex; // element's old index within old parent
        // evt.newIndex; // element's new index within new parent
        // evt.oldDraggableIndex; // element's old index within old parent, only counting draggable elements
        // evt.newDraggableIndex; // element's new index within new parent, only counting draggable elements
        // evt.clone; // the clone element
        // evt.pullMode; // when item is in another sortable: `"clone"` if cloning, `true` if moving
      },
    });

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-user-plus"></i>`,
          text: Translate.Render('sign-up'),
        }),
        html: async () =>
          await SignUp.Render({
            idModal: 'modal-sign-up',
            bottomRender: async () => html` <div class="in section-mp"></div>`,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-sign-out-alt"></i>`,
          text: Translate.Render('log-out'),
        }),
        html: async () => await LogOut.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-sign-in-alt"></i>`,
          text: Translate.Render('log-in'),
        }),
        html: async () => await LogIn.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-user-circle"></i>`,
          text: Translate.Render('account'),
        }),
        html: async () =>
          await Account.Render({
            idModal: 'modal-account',
            user: ElementsHealthcare.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-sliders-h"></i>`,
          text: Translate.Render('settings'),
        }),
        html: async () => await SettingsHealthcare.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
          text: Translate.Render('recover'),
        }),
        html: async () =>
          await Recover.Render({ idModal: 'modal-recover', user: ElementsHealthcare.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    const appoimentFormRender = async (eventData) => {
      const { barConfig } = await Themes[Css.currentTheme]();
      const idModal = `modal-healthcare-appointment${eventData ? `-${new Date(eventData.start).getTime()}` : ''}`;
      await Modal.Render({
        id: idModal,
        route: 'healthcare-appointment',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-medkit"></i>`,
          text: `${eventData ? `${eventData.event.title} ` : ''}${Translate.Render('healthcare-appointment')}`,
        }),
        html: async () =>
          await AppointmentFormHealthcare.Render({ idModal: 'modal-healthcare-appointment' }, eventData),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        // barMode,
      });
      if (!eventData) return { status: 'error' };
      const cleanEvent = () => {
        delete AppointmentFormHealthcare.Event[idModal];
        delete Modal.Data[idModal].onCloseListener[idModal];
      };
      return await new Promise((resolve) => {
        AppointmentFormHealthcare.Event[idModal] = async ({ status, data, message }) => {
          cleanEvent();
          await Modal.removeModal(idModal);
          return resolve({ status });
        };
        Modal.Data[idModal].onCloseListener[idModal] = () => {
          cleanEvent();
          return resolve({ status: 'error' });
        };
      });
    };

    EventsUI.onClick(`.main-btn-calendar`, async () => {
      const idModal = 'modal-calendar';
      const { barConfig } = await Themes[Css.currentTheme]();
      const route = 'calendar';
      const { data: hiddenDates } = await HealthcareAppointmentService.get({ id: 'appointment-dates' });
      await Modal.Render({
        id: idModal,
        route,
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-calendar-alt"></i>`,
          text: html`${Translate.Render('healthcare-appointment')}`, // Translate.Render('calendar'),
        }),
        html: async () => {
          setTimeout(() => {
            Scroll.addTopRefreshEvent({
              id: 'modal-calendar',
              callback: () => {
                location.reload();
              },
              condition: () => {
                return s('.main-body-calendar-modal-calendar').scrollTop === 0;
              },
            });
            Modal.Data['modal-calendar'].onCloseListener['TopRefreshEvent'] = () => {
              Scroll.removeTopRefreshEvent('.main-body-calendar-modal-calendar');
              delete LogIn.Event['model-appointment-calendar'];
              delete LogOut.Event['model-appointment-calendar'];
            };
            const authSwitch = () => {
              if (!s(`.btn-calendar-panel-${idModal}-add`)) return;
              if (commonModeratorGuard(ElementsHealthcare.Data.user.main.model.user.role))
                s(`.btn-calendar-panel-${idModal}-add`).classList.remove('hide');
              else {
                s(`.btn-calendar-panel-${idModal}-add`).classList.add('hide');
              }
            };
            LogIn.Event['model-appointment-calendar'] = authSwitch;
            LogOut.Event['model-appointment-calendar'] = authSwitch;
            setTimeout(() => {
              if (s(`.main-body-btn-ui-open`).classList.contains('hide')) s(`.main-body-btn-ui`).click();

              setTimeout(() => {
                s(`.btn-calendar-panel-modal-calendar-custom0`).click();
              }, 500);
            });
          });
          return await CalendarCore.Render({
            idModal,
            Elements: ElementsHealthcare,
            heightBottomBar,
            heightTopBar,
            route,
            hiddenDates,
            parentIdModal: 'modal-calendar',
            role: {
              add: () => commonModeratorGuard(ElementsHealthcare.Data.user.main.model.user.role),
            },
            eventClick: async function (dateData, args) {
              const { status } = await appoimentFormRender(dateData);
              if (status === 'success') {
                CalendarCore.Data[idModal].hiddenDates.push(dateData.start);
                args.el.remove();
              }
            },
          });
        },
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-healthcare-appointment`, () => {
      s(`.main-btn-calendar`).click();
      // appoimentFormRender();
    });

    EventsUI.onClick(`.main-btn-nutrition-tips`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-nutrition-tips',
        route: 'nutrition-tips',
        barConfig,
        title: renderViewTitle({
          icon: html`<img
            class="slide-menu-icon"
            src="${getProxyPath()}${MenuHomeHealthcare['nutrition-tips'].icon}"
          />`,
          text: Translate.Render('nutrition-tips'),
        }),
        html: async () => {
          let render = '';

          for (const indexTip of range(0, NutritionalTips.length - 1)) {
            render += html`<div class="in nutrition-tips-panel-container">
              <div class="in nutrition-tips-panel-sub-container">
                <div class="fl">
                  <div class="in fll" style="width: 30%;">
                    <div class="in nutrition-tips-panel-cell">
                      <div class="abs center">
                        <img
                          class="in nutrition-tips-panel-icon"
                          src="${getProxyPath()}${NutritionalTips[indexTip].icon}"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="in fll" style="width: 70%;">
                    <div class="in nutrition-tips-panel-cell">
                      <br />${Translate.Render(`nutrition-tips-${indexTip}`)}
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
          }
          return html`${render}`;
        },
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });
  },
};

export { MenuHealthcare };
