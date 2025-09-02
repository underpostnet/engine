import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, borderChar, boxShadow, cssEffect, darkTheme, renderCssAttr } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, getQueryParams, htmls, s, setPath } from '../core/VanillaJs.js';
import { ElementsNexodev } from './ElementsNexodev.js';
import Sortable from 'sortablejs';
import { RouterNexodev } from './RoutesNexodev.js';
import { CalendarNexodev } from './CalendarNexodev.js';
import { DashboardNexodev } from './DashboardNexodev.js';
import { StreamNexodev } from './StreamNexodev.js';
import { Docs } from '../core/Docs.js';
import { Content } from '../core/Content.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Chat } from '../core/Chat.js';
import { SettingsNexodev } from './SettingsNexodev.js';
import { Wallet } from '../core/Wallet.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { InstanceManagement } from '../../services/instance/instance.management.js';
import { UserManagement } from '../../services/user/user.management.js';
import { PanelForm } from '../core/PanelForm.js';
import { RouterEvents, setDocTitle } from '../core/Router.js';
import { CronManagement } from '../../services/cron/cron.management.js';
import { Scroll } from '../core/Scroll.js';

const MenuNexodev = {
  Data: {},
  Render: async function (options = { htmlMainBody: () => '' }) {
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
          <div class="fl menu-btn-container-children"></div>
          <div class="fl menu-btn-container-main">
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
                text: html`<span class="menu-label-text"
                  >${Translate.Render('docs')} <i class="fas fa-caret-down in down-arrow-submenu"></i
                ></span>`,
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
            ${await BtnIcon.Render({
              class: 'in wfa main-btn-menu main-btn-default-management',
              label: renderMenuLabel({
                icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
                text: html`<span class="menu-label-text">${Translate.Render('default-management')}</span>`,
              }),
              attrs: `data-id="default-management"`,
              tabHref: `${getProxyPath()}default-management`,
              handleContainerClass: 'handle-btn-container',
              tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('default-management', 'right')),
            })}
            ${await BtnIcon.Render({
              class: 'in wfa main-btn-menu main-btn-user-management',
              label: renderMenuLabel({
                icon: html`<i class="fas fa-users-cog"></i>`,
                text: html`<span class="menu-label-text">${Translate.Render('user-management')}</span>`,
              }),
              attrs: `data-id="user-management"`,
              tabHref: `${getProxyPath()}user-management`,
              handleContainerClass: 'handle-btn-container',
              tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('user-management', 'right')),
            })}
            ${await BtnIcon.Render({
              class: 'in wfa main-btn-menu main-btn-instance-management',
              label: renderMenuLabel({
                icon: html`<i class="fas fa-layer-group"></i>`,
                text: html`<span class="menu-label-text">${Translate.Render('instance-management')}</span>`,
              }),
              attrs: `data-id="instance-management"`,
              tabHref: `${getProxyPath()}instance-management`,
              handleContainerClass: 'handle-btn-container',
              tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('instance-management', 'right')),
            })}
            ${await BtnIcon.Render({
              class: 'in wfa main-btn-menu main-btn-cron-management',
              label: renderMenuLabel({
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.8 19.4c.1 0 .1.1 0 .2l-1 1.7c-.1.1-.2.1-.3.1l-1.2-.4c-.3.2-.5.3-.8.5l-.2 1.3c0 .1-.1.2-.2.2h-2c-.1 0-.2-.1-.3-.2l-.2-1.3c-.3-.1-.6-.3-.8-.5l-1.2.5c-.1 0-.2 0-.3-.1l-1-1.7c-.1-.1 0-.2.1-.3l1.1-.8v-1l-1.1-.8c-.1-.1-.1-.2-.1-.3l1-1.7c.1-.1.2-.1.3-.1l1.2.5c.3-.2.5-.3.8-.5l.2-1.3c0-.1.1-.2.3-.2h2c.1 0 .2.1.2.2l.2 1.3c.3.1.6.3.9.5l1.2-.5c.1 0 .3 0 .3.1l1 1.7c.1.1 0 .2-.1.3l-1.1.8v1zM19.5 18c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5s.7 1.5 1.5 1.5s1.5-.7 1.5-1.5M13 14V8h-2v6m4-13H9v2h6zm-3.7 19C7.8 19.6 5 16.6 5 13c0-3.9 3.1-7 7-7c3.2 0 5.9 2.1 6.7 5c.8.1 1.5.3 2.2.6c-.3-1.6-.9-3-1.9-4.2L20.5 6c-.5-.5-1-1-1.5-1.4L17.6 6c-1.5-1.3-3.5-2-5.6-2c-5 0-9 4-9 9s4 9 9 9h.3c-.5-.6-.8-1.3-1-2"
                  />
                </svg>`,
                text: html`<span class="menu-label-text"
                  ><div class="inl" style="top: -5px">${Translate.Render('cron-management')}</div></span
                >`,
              }),
              attrs: `data-id="cron-management"`,
              tabHref: `${getProxyPath()}cron-management`,
              handleContainerClass: 'handle-btn-container',
              tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('cron-management', 'right')),
            })}
          </div>
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      // titleRender: () => '',
      mode: 'slide-menu-right',
      RouterInstance,
      barMode,
      heightTopBar,
      heightBottomBar,
      htmlMainBody: options.htmlMainBody,
    });

    ThemeEvents['main-theme-handler'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/logo/nexodev-white-t.png`
        : `${getProxyPath()}assets/logo/nexodev-purple-t.png`;
      htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
      if (darkTheme) {
        const backgroundImage = `${getProxyPath()}assets/background/dark-purple.jpg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
            }
          `,
        );
      } else {
        const backgroundImage = `${getProxyPath()}assets/background/white-purple.jpg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
              transform: rotate(180deg);
            }
          `,
        );
      }
    };

    setTimeout(ThemeEvents['main-theme-handler']);

    this.Data[id].sortable = new Sortable(s(`.menu-btn-container-main`), {
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
      const idModal = 'modal-blog';
      const routeModal = 'blog';
      const idEvent = `form-panel-${idModal}`;
      await Modal.Render({
        id: idModal,
        route: routeModal,
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-file-invoice"></i>`,
          text: Translate.Render('blog'),
        }),
        observer: true,
        html: async () => {
          setTimeout(async () => {
            await PanelForm.instance({
              idPanel: 'nexodev-blog',
              heightTopBar,
              heightBottomBar,
              defaultUrlImage: `${getProxyPath()}assets/splash/android-chrome-96x96.png`,
              Elements: ElementsNexodev,
              parentIdModal: idModal,
              scrollClassContainer: `html-${idModal}`,
              route: routeModal,
            });
          });
        },
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
      const route = 'calendar';
      await Modal.Render({
        id: 'modal-calendar',
        route,
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-calendar-alt"></i>`,
          text: Translate.Render('calendar'),
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
            };
          });
          return await CalendarNexodev.Render({
            idModal: 'modal-calendar',
            Elements: ElementsNexodev,
            heightBottomBar,
            heightTopBar,
            route,
            parentIdModal: 'modal-calendar',
          });
        },
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-content`, async () => {
      let subModalId = '';
      const path =
        location.pathname[location.pathname.length - 1] === '/' ? location.pathname.slice(0, -1) : location.pathname;

      if (path.split('/').pop() === 'content' && getQueryParams().cid) {
        subModalId = `-${getQueryParams().cid}`;
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
          }),
        query: true,
        observer: true,
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

    EventsUI.onClick(`.main-btn-docs`, async () => {
      setTimeout(async () => {
        htmls(`.nav-title-display-modal-menu`, html`<i class="fas fa-book"></i> ${Translate.Render('docs')}`);
        await Docs.Init({
          idModal: 'modal-docs',
        });
      });

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-book"></i>`,
          text: Translate.Render('docs'),
        }),
        html: async () => {
          const docsData = [
            {
              id: 'getting-started',
              icon: 'rocket',
              title: 'Getting Started',
              description: 'Learn the basics and get started with our platform',
            },
            {
              id: 'api-docs',
              icon: 'code',
              title: 'API Reference',
              description: 'Detailed documentation of our API endpoints',
            },
            {
              id: 'guides',
              icon: 'book',
              title: 'Guides',
              description: 'Step-by-step tutorials and how-to guides',
            },
            {
              id: 'demo',
              icon: 'laptop-code',
              title: 'Demo',
              description: 'Practical examples and code snippets',
            },
            {
              id: 'faq',
              icon: 'question-circle',
              title: 'FAQ',
              description: 'Frequently asked questions',
            },
            {
              id: 'community',
              icon: 'users',
              title: 'Community',
              description: 'Join our developer community',
            },
          ];

          return html`
            <style>
              .docs-landing {
                padding: 2rem;
                max-width: 1200px;
                margin: 0 auto;
                height: 100%;
                box-sizing: border-box;
              }
              .docs-header {
                text-align: center;
                margin-bottom: 3rem;
              }
              .docs-header h1 {
                font-size: 2.5rem;
                margin: 0 0 1rem;
                color: var(--text-primary);
                line-height: 1.2;
              }
              .docs-header p {
                font-size: 1.2rem;
                color: var(--text-secondary);
                max-width: 700px;
                margin: 0 auto 2rem;
                line-height: 1.6;
              }
              .docs-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 1.5rem;
                margin: 0;
                padding: 0;
                list-style: none;
              }
              .docs-card {
                background: var(--card-bg);
                border-radius: 8px;
                padding: 1.5rem;
                border: 1px solid var(--border-color);
                display: flex;
                flex-direction: column;
                height: 100%;
                position: relative;
                overflow: hidden;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                will-change: transform, box-shadow;
              }
              .docs-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: currentColor;
                opacity: 0.1;
                transition: opacity 0.2s ease;
              }
              .docs-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
              }
              .docs-card:hover::before {
                opacity: 0.2;
              }
              .card-icon {
                font-size: 1.75rem;
                width: 56px;
                height: 56px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 0 1.25rem;
                transition: transform 0.2s ease;
              }
              .docs-card:hover .card-icon {
                transform: scale(1.1);
              }
              .card-content {
                flex: 1;
              }
              .card-content h3 {
                margin: 0 0 0.5rem;
                color: var(--text-primary);
                font-size: 1.25rem;
                font-weight: 600;
              }
              .card-content p {
                margin: 0;
                color: var(--text-secondary);
                line-height: 1.6;
                font-size: 0.95rem;
              }
              .docs-card-container {
                cursor: pointer;
                margin-bottom: 50px;
              }
            </style>

            <div class="docs-landing">
              <div class="docs-header">
                <h1>Documentation</h1>
                <p>
                  Find everything you need to build amazing applications with our platform. Get started with our guides,
                  API reference, and examples.
                </p>
                <!--
                <div class="search-bar">
                  <i class="fas fa-search"></i>
                  <input type="text" placeholder="Search documentation..." id="docs-search">
                </div>
                -->
              </div>

              <ul class="docs-grid">
                ${docsData
                  .map((item) => {
                    setTimeout(() => {
                      if (s(`.docs-card-container-${item.id}`)) {
                        s(`.docs-card-container-${item.id}`).onclick = () => {
                          if (item.id.match('demo')) {
                            location.href = 'https://underpostnet.github.io/pwa-microservices-template-ghpkg/';
                          } else if (item.id.match('api')) {
                            if (s(`.btn-docs-api`)) s(`.btn-docs-api`).click();
                          } else {
                            if (s(`.btn-docs-src`)) s(`.btn-docs-src`).click();
                          }
                        };
                      }
                    });
                    return html`
                      <div class="in docs-card-container docs-card-container-${item.id}">
                        <li class="docs-card">
                          <div class="card-icon">
                            <i class="fas fa-${item.icon}"></i>
                          </div>
                          <div class="card-content">
                            <h3>${item.title}</h3>
                            <p>${item.description}</p>
                          </div>
                        </li>
                      </div>
                    `;
                  })
                  .join('')}
              </ul>
            </div>
          `;
        },

        // await Docs.Init({
        //   idModal: 'modal-docs',
        // }),
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

    EventsUI.onClick(`.main-btn-default-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-default-management',
        route: 'default-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
          text: Translate.Render('default-management'),
        }),
        html: async () => await DefaultManagement.RenderTable(),
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

    EventsUI.onClick(`.main-btn-user-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-user-management',
        route: 'user-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-users-cog"></i>`,
          text: Translate.Render('user-management'),
        }),
        html: async () => await UserManagement.RenderTable({ Elements: ElementsNexodev }),
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

    EventsUI.onClick(`.main-btn-instance-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-instance-management',
        route: 'instance-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-layer-group"></i>`,
          text: Translate.Render('instance-management'),
        }),
        html: async () => InstanceManagement.RenderTable({ Elements: ElementsNexodev }),
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

    EventsUI.onClick(`.main-btn-cron-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cron-management',
        route: 'cron-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.8 19.4c.1 0 .1.1 0 .2l-1 1.7c-.1.1-.2.1-.3.1l-1.2-.4c-.3.2-.5.3-.8.5l-.2 1.3c0 .1-.1.2-.2.2h-2c-.1 0-.2-.1-.3-.2l-.2-1.3c-.3-.1-.6-.3-.8-.5l-1.2.5c-.1 0-.2 0-.3-.1l-1-1.7c-.1-.1 0-.2.1-.3l1.1-.8v-1l-1.1-.8c-.1-.1-.1-.2-.1-.3l1-1.7c.1-.1.2-.1.3-.1l1.2.5c.3-.2.5-.3.8-.5l.2-1.3c0-.1.1-.2.3-.2h2c.1 0 .2.1.2.2l.2 1.3c.3.1.6.3.9.5l1.2-.5c.1 0 .3 0 .3.1l1 1.7c.1.1 0 .2-.1.3l-1.1.8v1zM19.5 18c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5s.7 1.5 1.5 1.5s1.5-.7 1.5-1.5M13 14V8h-2v6m4-13H9v2h6zm-3.7 19C7.8 19.6 5 16.6 5 13c0-3.9 3.1-7 7-7c3.2 0 5.9 2.1 6.7 5c.8.1 1.5.3 2.2.6c-.3-1.6-.9-3-1.9-4.2L20.5 6c-.5-.5-1-1-1.5-1.4L17.6 6c-1.5-1.3-3.5-2-5.6-2c-5 0-9 4-9 9s4 9 9 9h.3c-.5-.6-.8-1.3-1-2"
            />
          </svg>`,
          text: html`<div class="inl" style="top:-5px">${Translate.Render('cron-management')}</div>`,
        }),
        html: async () => CronManagement.RenderTable({ Elements: ElementsNexodev }),
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

    setTimeout(async () => {
      return;
      const { barConfig } = await Themes[Css.currentTheme]();

      // create simple modal arbritatry for test
      Modal.Render({
        id: 'modal-test',
        barConfig,
        title: 'Test',
        html: () => html`<div>Test</div>`,
        style: {
          // top: '100px',
          // left: '100px',
          // width: '200px',
          // height: '200px',
          background: 'red',
          border: '1px solid #000',
          'z-index': 10,
        },
        slideMenu: 'modal-menu',
        // RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });

      Modal.Data['modal-menu'].homeModals.push('modal-test');
    });
  },
};

export { MenuNexodev };
