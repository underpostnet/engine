import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, Themes, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from '../core/VanillaJs.js';
import { ElementsBms } from './ElementsBms.js';
import Sortable from 'sortablejs';
import { RouterBms } from './RoutesBms.js';
import { Blog } from '../core/Blog.js';
import { CalendarBms } from './CalendarBms.js';
import { DashboardBms } from './DashboardBms.js';
import { StreamBms } from './StreamBms.js';
import { Docs } from '../core/Docs.js';
import { Content } from '../core/Content.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Chat } from '../core/Chat.js';
import { SettingsBms } from './SettingsBms.js';
import { DropDown } from '../core/DropDown.js';
import { loggerFactory } from '../core/Logger.js';
import { Panel } from '../core/Panel.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';

const logger = loggerFactory(import.meta);

const MenuBms = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterBms();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-blog hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-file-invoice"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('blog')}</span>`,
            }),
            attrs: `data-id="blog"`,
            tabHref: `${getProxyPath()}blog`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-calendar hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-calendar-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('calendar')}</span>`,
            }),
            attrs: `data-id="calendar"`,
            tabHref: `${getProxyPath()}calendar`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('calendar')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-dashboard hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-chart-line"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('dashboard')}</span>`,
            }),
            attrs: `data-id="dashboard"`,
            tabHref: `${getProxyPath()}dashboard`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('dashboard')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-stream hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-video"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('stream')}</span>`,
            }),
            attrs: `data-id="stream"`,
            tabHref: `${getProxyPath()}stream`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('stream')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-docs hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-book"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('docs')}</span>`,
            }),
            attrs: `data-id="docs"`,
            tabHref: `${getProxyPath()}docs`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('docs')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-content hide',
            label: renderMenuLabel({
              icon: html`<i class="far fa-file"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('content')}</span>`,
            }),
            attrs: `data-id="content"`,
            tabHref: `${getProxyPath()}content`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('content')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-cloud hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-cloud"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('cloud')}</span>`,
            }),
            attrs: `data-id="cloud"`,
            tabHref: `${getProxyPath()}cloud`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('cloud')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-chat hide',
            label: renderMenuLabel({
              icon: html`<i class="far fa-comments"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('chat')}</span>`,
            }),
            attrs: `data-id="chat"`,
            tabHref: `${getProxyPath()}chat`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('chat')),
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
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      titleRender: () => {
        setTimeout(() => {
          htmls(`.action-btn-app-icon-render`, NameApp);
        });
      },
      mode: 'slide-menu',
      heightTopBar,
      heightBottomBar,
      htmlMainBody: async () => {
        const idPanel = 'real-state-panel';
        const formData = [
          {
            model: 'id',
            id: 'id',
            inputType: 'text',
            panel: {},
            disableRender: true,
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'propertyType',
            model: 'propertyType',
            inputType: 'dropdown',
            dropdown: {
              options: ['Single Family Home', 'Condo', 'Townhouse', 'Commercial', ' Land'],
            },
            rules: [{ type: 'isEmpty' }],
            panel: { type: 'title' },
          },
          {
            id: 'address',
            model: 'address',
            inputType: 'text',
            panel: { type: 'subtitle' },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'price',
            model: 'price',
            inputType: 'number',
            panel: {
              type: 'info-row-pin',
              icon: {
                value: html`<i class="fas fa-dollar-sign"></i>`,
              },
              newIcon: {
                key: html``,
              },
            },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'bedrooms',
            model: 'bedrooms',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            id: 'bathrooms',
            model: 'bathrooms',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            id: 'squareFootage',
            model: 'squareFootage',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            id: 'imageFileId',
            model: 'imageFileId',
            inputType: 'file',
            panel: {},
            rules: [{ type: 'isEmpty' }],
          },
        ];

        const data = [
          {
            id: 1,
            propertyType: 'Single Family Home',
            address: '123 Main Street, Anytown, CA 95123',
            price: 500000,
            bedrooms: 3,
            bathrooms: 2,
            squareFootage: 1500,
            imageUrl: 'https://example.com/property1.jpg',
            isNew: true,
          },
          {
            id: 2,
            propertyType: 'Condo',
            address: '456 Elm Street, Anytown, CA 95123',
            price: 350000,
            bedrooms: 2,
            bathrooms: 1.5,
            squareFootage: 1200,
            imageUrl: 'https://example.com/property2.jpg',
          },
          {
            id: 3,
            propertyType: 'Townhouse',
            address: '789 Oak Street, Anytown, CA 95123',
            price: 400000,
            bedrooms: 3,
            bathrooms: 2,
            squareFootage: 1400,
            imageUrl: 'https://example.com/property3.jpg',
          },
          {
            id: 4,
            propertyType: 'Commercial',
            address: '123 Main Street, Anytown, CA 95123',
            price: 1000000,
            squareFootage: 2500,
            imageUrl: 'https://example.com/property4.jpg',
          },
          {
            id: 5,
            propertyType: 'Land',
            address: '456 Elm Street, Anytown, CA 95123',
            price: 200000,
            acreage: 5,
            imageUrl: 'https://example.com/property5.jpg',
          },
        ];
        return await Panel.Render({
          idPanel,
          formData,
          heightTopBar,
          heightBottomBar,
          data,
          scrollClassContainer: 'main-body',
          titleIcon: html`<i class="fas fa-tag"></i>`,
          formContainerClass: 'session-in-log-in',
          callBackPanelRender: async function ({ data, imgRender }) {
            const src = 'https://api.api-ninjas.com/v1/randomimage?category=city';
            const options = {
              headers: { 'X-Api-Key': 'FyITmcxRXkCaUehbX6K0/g==uxZcFKL0dZUUg48G', Accept: 'image/jpg' },
            };
            await new Promise((resolve) => {
              fetch(src, options)
                .then((res) => res.blob())
                .then(async (blob) => {
                  data.imageUrl = URL.createObjectURL(blob);
                  return resolve(await imgRender(data));
                });
            });
          },
        });
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
            bottomRender: async () => html` <div class="in section-mp">
              ${await DropDown.Render({
                label: html`${Translate.Render('select-role')}`,
                type: 'checkbox',
                data: ['broker', 'owner'].map((dKey) => {
                  return {
                    value: dKey,
                    data: dKey,
                    checked: true,
                    display: html`${Translate.Render(dKey)}`,
                    onClick: function () {
                      logger.info('DropDown onClick', this.checked);
                    },
                  };
                }),
              })}
            </div>`,
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
            user: ElementsBms.Data.user.main.model.user,
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
          await DashboardBms.Render({
            idModal: 'modal-dashboard',
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
          await StreamBms.Render({
            idModal: 'modal-stream',
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
          await CalendarBms.Render({
            idModal: 'modal-calendar',
            Elements: ElementsBms,
          }),
        handleType: 'bar',
        maximize: true,
        observer: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-content`, async () => {
      let subModalId = '';
      const path =
        location.pathname[location.pathname.length - 1] === '/' ? location.pathname.slice(0, -1) : location.pathname;

      if (path.replaceAll(`${getProxyPath()}`, '') === 'content' && getQueryParams().id) {
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
        html: async () => await SettingsBms.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
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
          await Docs.Render({
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
          await Recover.Render({ idModal: 'modal-recover', user: ElementsBms.Data.user.main.model.user }),
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

export { MenuBms };
