import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme, renderCssAttr } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from '../core/VanillaJs.js';
import { ElementsNexodev } from './ElementsNexodev.js';
import Sortable from 'sortablejs';
import { RouterNexodev } from './RoutesNexodev.js';
import { Blog } from '../core/Blog.js';
import { CalendarNexodev } from './CalendarNexodev.js';
import { DashboardNexodev } from './DashboardNexodev.js';
import { StreamNexodev } from './StreamNexodev.js';
import { Docs } from '../core/Docs.js';
import { Content } from '../core/Content.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Chat } from '../core/Chat.js';
import { SettingsNexodev } from './SettingsNexodev.js';
import { AppointmentFormHealthcare } from '../healthcare/AppointmentFormHealthcare.js';
import { Wallet } from '../core/Wallet.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';

const MenuNexodev = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterNexodev();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = 'top-bottom-bar';
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-blog',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-file-invoice"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('blog')}</span>`,
            }),
            attrs: `data-id="blog"`,
            tabHref: `${getProxyPath()}blog`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-calendar',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-calendar-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('calendar')}</span>`,
            }),
            attrs: `data-id="calendar"`,
            tabHref: `${getProxyPath()}calendar`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('calendar', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-dashboard',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-chart-line"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('dashboard')}</span>`,
            }),
            attrs: `data-id="dashboard"`,
            tabHref: `${getProxyPath()}dashboard`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('dashboard', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-stream',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-video"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('stream')}</span>`,
            }),
            attrs: `data-id="stream"`,
            tabHref: `${getProxyPath()}stream`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('stream', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-docs',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-book"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('docs')}</span>`,
            }),
            attrs: `data-id="docs"`,
            tabHref: `${getProxyPath()}docs`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('docs', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-content',
            label: renderMenuLabel({
              icon: html`<i class="far fa-file"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('content')}</span>`,
            }),
            attrs: `data-id="content"`,
            tabHref: `${getProxyPath()}content`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('content', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-cloud',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-cloud"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('cloud')}</span>`,
            }),
            attrs: `data-id="cloud"`,
            tabHref: `${getProxyPath()}cloud`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('cloud', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-chat',
            label: html`${renderMenuLabel({
              icon: html`<i class="far fa-comments"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('chat')}</span>`,
            })}
            ${await Badge.Render({
              id: 'main-btn-chat',
              type: 'circle-red',
              style: badgeNotificationMenuStyle,
              classList: 'hide',
            })}`,
            attrs: `data-id="chat"`,
            tabHref: `${getProxyPath()}chat`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('chat', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-settings',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('settings', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('home', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-in', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('sign-up', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-out', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('account', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-healthcare-appointment',
            label: renderMenuLabel({
              icon: html` <i class="fas fa-medkit"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('healthcare-appointment')}</span>`,
            }),
            attrs: `data-id="healthcare-appointment"`,
            tabHref: `${getProxyPath()}healthcare-appointment`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('healthcare-appointment', 'right')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-wallet',
            label: renderMenuLabel({
              icon: html` <i class="fas fa-wallet"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('wallet')}</span>`,
            }),
            attrs: `data-id="wallet"`,
            tabHref: `${getProxyPath()}wallet`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('wallet', 'right')),
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('recover', 'right')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      // titleRender: () => '',
      mode: 'slide-menu-right',
      barMode,
      heightTopBar,
      heightBottomBar,
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = darkTheme
            ? `${getProxyPath()}assets/logo/nexodev-white-t.png`
            : `${getProxyPath()}assets/logo/nexodev-purple-t.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
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
        html: async () => await SignUp.Render({ idModal: 'modal-sign-up' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
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
        barMode,
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
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-blog`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-blog',
        route: 'blog',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-file-invoice"></i>`,
          text: Translate.Render('blog'),
        }),
        html: async () => await Blog.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-wallet`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-wallet',
        route: 'wallet',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-wallet"></i>`,
          text: Translate.Render('wallet'),
        }),
        html: async () => await Wallet.Render({ idModal: 'modal-wallet' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
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
            user: ElementsNexodev.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-dashboard`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-dashboard',
        route: 'dashboard',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-chart-line"></i>`,
          text: Translate.Render('dashboard'),
        }),
        html: async () =>
          await DashboardNexodev.Render({
            idModal: 'modal-dashboard',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-stream`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-stream',
        route: 'stream',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-video"></i>`,
          text: Translate.Render('stream'),
        }),
        html: async () =>
          await StreamNexodev.Render({
            idModal: 'modal-stream',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-calendar`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-calendar',
        route: 'calendar',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-calendar-alt"></i>`,
          text: Translate.Render('calendar'),
        }),
        html: async () =>
          await CalendarNexodev.Render({
            idModal: 'modal-calendar',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-content`, async () => {
      let subModalId = '';
      const path =
        location.pathname[location.pathname.length - 1] === '/' ? location.pathname.slice(0, -1) : location.pathname;

      if (path.split('/').pop() === 'content' && getQueryParams().id) {
        subModalId = `-${getQueryParams().id}`;
      }

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: `modal-content${subModalId}`,
        route: 'content',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="far fa-file"></i>`,
          text: Translate.Render('content'),
        }),
        html: async () =>
          await Content.Render({
            idModal: `modal-content${subModalId}`,
            Menu: this,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-cloud`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cloud',
        route: 'cloud',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-cloud"></i>`,
          text: Translate.Render('cloud'),
        }),
        html: async () => await FileExplorer.Render({ idModal: 'modal-cloud' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-chat`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-chat',
        route: 'chat',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="far fa-comments"></i>`,
          text: Translate.Render('chat'),
        }),
        html: async () => await Chat.Render({ idModal: 'modal-chat' }),
        handleType: 'bar',
        maximize: true,
        observer: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
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
        html: async () => await SettingsNexodev.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-healthcare-appointment`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-healthcare-appointment',
        route: 'healthcare-appointment',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-medkit"></i>`,
          text: Translate.Render('healthcare-appointment'),
        }),
        html: async () => await AppointmentFormHealthcare.Render({ idModal: 'modal-healthcare-appointment' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-docs`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-book"></i>`,
          text: Translate.Render('docs'),
        }),
        html: async () =>
          await Docs.Init({
            idModal: 'modal-docs',
          }),
        handleType: 'bar',
        observer: true,
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
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
          await Recover.Render({ idModal: 'modal-recover', user: ElementsNexodev.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });
  },
};

export { MenuNexodev };
