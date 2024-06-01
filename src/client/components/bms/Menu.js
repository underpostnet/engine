import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, Themes, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
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
import { Settings } from './Settings.js';
import { DropDown } from '../core/DropDown.js';
import { loggerFactory } from '../core/Logger.js';
import { Panel } from '../core/Panel.js';

const logger = loggerFactory(import.meta);

const Menu = {
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
            class: 'wfa main-btn-menu main-btn-blog hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-file-invoice"></i>`,
              text: html`${Translate.Render('blog')}`,
            }),
            attrs: `data-id="5"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-calendar hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-calendar-alt"></i>`,
              text: html`${Translate.Render('calendar')}`,
            }),
            attrs: `data-id="6"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-dashboard hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-chart-line"></i>`,
              text: html`${Translate.Render('dashboard')}`,
            }),
            attrs: `data-id="7"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-stream hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-video"></i>`,
              text: html`${Translate.Render('stream')}`,
            }),
            attrs: `data-id="8"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-docs hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-book"></i>`,
              text: html`${Translate.Render('docs')}`,
            }),
            attrs: `data-id="9"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-content hide',
            label: renderMenuLabel({
              icon: html`<i class="far fa-file"></i>`,
              text: html`${Translate.Render('content')}`,
            }),
            attrs: `data-id="10"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-cloud hide',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-cloud"></i>`,
              text: html`${Translate.Render('cloud')}`,
            }),
            attrs: `data-id="11"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-chat hide',
            label: renderMenuLabel({
              icon: html`<i class="far fa-comments"></i>`,
              text: html`${Translate.Render('chat')}`,
            }),
            attrs: `data-id="12"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-settings',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`${Translate.Render('settings')}`,
            }),
            attrs: `data-id="13"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-home',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-home"></i>`,
              text: html`${Translate.Render('home')}`,
            }),
            // style: 'display: none',
            attrs: `data-id="0"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-log-in',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-in-alt"></i>`,
              text: html`${Translate.Render('log-in')}`,
            }),
            attrs: `data-id="1"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-sign-up',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-plus"></i>`,
              text: html`${Translate.Render('sign-up')}`,
            }),
            attrs: `data-id="2"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-log-out',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-out-alt"></i>`,
              text: html`${Translate.Render('log-out')}`,
            }),
            attrs: `data-id="3"`,
            style: 'display: none',
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-account',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-circle"></i>`,
              text: html`${Translate.Render('account')}`,
            }),
            style: 'display: none',
            attrs: `data-id="4"`,
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      titleRender: () => htmls(`.action-btn-app-icon-render`, NameApp),
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
            disableRender: true,
            id: 'imageUrl',
            model: 'imageUrl',
            inputType: 'file',
            panel: {},
            rules: [{ type: 'isEmpty' }],
          },
        ].map((formObj) => {
          formObj.id = `${idPanel}-${formObj.id}`;
          return formObj;
        });

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
        return await Panel.Render({ idPanel, formData, heightTopBar, data, scrollClassContainer: 'main-body' });
      },
    });

    this.Data[id].sortable = Modal.mobileModal()
      ? null
      : new Sortable(s(`.menu-btn-container`), {
          animation: 150,
          group: `menu-sortable`,
          forceFallback: true,
          fallbackOnBody: true,
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
            footerRender: html` <div class="in section-mp">
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
            user: Elements.Data.user.main.model.user,
            disabled: ['emailConfirm'],
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
        html: async () => await Settings.Render({ idModal: 'modal-settings' }),
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
  },
};

export { Menu };
