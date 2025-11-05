import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance, random } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { ElementsCyberiaPortal } from './ElementsCyberiaPortal.js';
import Sortable from 'sortablejs';
import { RouterCyberiaPortal, BannerAppTemplate } from './RoutesCyberiaPortal.js';
import { SettingsCyberiaPortal } from './SettingsCyberiaPortal.js';
import { Chat } from '../core/Chat.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { ObjectLayerEngineModal } from '../core/ObjectLayerEngineModal.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';

const MenuCyberiaPortal = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterCyberiaPortal();

    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/home.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="0"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-in',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-sign-up',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('sign-up')}</span>`,
            }),
            attrs: `data-id="sign-up"`,
            tabHref: `${getProxyPath()}sign-up`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('sign-up')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-out',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('log-out')}</span>`,
            }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-out')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-account',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/account.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('account')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="account"`,
            tabHref: `${getProxyPath()}account`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('account')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-settings',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-server hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-server"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('server')}</span>`,
            }),
            attrs: `data-id="server"`,
            tabHref: `${getProxyPath()}server`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('server')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-chat',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/chat.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('chat')}</span>`,
            }),
            attrs: `data-id="chat"`,
            tabHref: `${getProxyPath()}chat`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('chat')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-admin hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-user-tie"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('admin')}</span>`,
            }),
            attrs: `data-id="admin"`,
            tabHref: `/admin`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('admin')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-recover hide',
            useMenuBtn: true,
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
            class: 'in wfa main-btn-menu main-btn-object-layer-engine',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('object-layer-engine')}</span>`,
            }),
            attrs: `data-id="object-layer-engine"`,
            tabHref: `${getProxyPath()}object-layer-engine`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('object-layer-engine')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-object-layer-engine-management',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.Render('object-layer-engine-management')}</span>`,
            }),
            attrs: `data-id="object-layer-engine-management"`,
            tabHref: `${getProxyPath()}object-layer-engine-management`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('object-layer-engine-management')),
          })}
        </div>
      `,
      // htmlMainBody: async () => {
      //   return '';
      //   return await ServerCyberiaPortal.Render({
      //     idModal: 'modal-server-body',
      //     events: {
      //       'change-server-body': async ({ name }) => {
      //         const { protocol, hostname } = window.location;
      //         return (location.href = `${protocol}//${hostname}/${name}`);
      //       },
      //     },
      //   });
      // },
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      titleRender: () => {
        return '';
      },
      // mode: 'slide-menu-right',
      mode: 'slide-menu',
      RouterInstance,
      heightTopBar,
      heightBottomBar,
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

    ThemeEvents['portal-main-theme-event'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/ui-icons/cyberia-white.png`
        : `${getProxyPath()}assets/ui-icons/cyberia-white.png`;

      htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);

      if (darkTheme) {
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background: #191919;
            }
          `,
        );
      } else {
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background: #e8e8e8;
            }
          `,
        );
      }
    };
    setTimeout(ThemeEvents['portal-main-theme-event']);

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('sign-up')}</span>`,
        }),
        html: async () => await SignUp.Render({ idModal: 'modal-sign-up' }),
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('log-out')}</span>`,
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('log-in')}</span>`,
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/account.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('account')}</span>`,
        }),
        html: async () =>
          await Account.Render({
            idModal: 'modal-account',
            user: ElementsCyberiaPortal.Data.user.main.model.user,
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('settings')}</span>`,
        }),
        html: async () => await SettingsCyberiaPortal.Render({ idModal: 'modal-settings' }),
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/chat.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('chat')}</span>`,
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

    EventsUI.onClick(`.main-btn-server`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-server',
        route: 'server',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-server"></i>`,
          text: Translate.Render('server'),
        }),
        html: async () => '',
        // await ServerCyberiaPortal.Render({
        //   idModal: 'modal-server',
        //   events: {
        //     'change-server': async ({ name }) => {
        //       const { protocol, hostname } = window.location;
        //       return (location.href = `${protocol}//${hostname}/${name}`);
        //     },
        //   },
        // }),
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
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/update.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('recover')}</span>`,
        }),
        html: async () =>
          await Recover.Render({ idModal: 'modal-recover', user: ElementsCyberiaPortal.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-object-layer-engine`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-object-layer-engine',
        route: 'object-layer-engine',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal' > ${Translate.Render('object-layer-engine')}</span>`,
        }),
        html: async () =>
          await ObjectLayerEngineModal.Render({
            idModal: 'modal-object-layer-engine',
            Elements: ElementsCyberiaPortal,
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

    EventsUI.onClick(`.main-btn-object-layer-engine-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-object-layer-engine-management',
        route: 'object-layer-engine-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.Render('object-layer-engine-management')}</span>`,
        }),
        html: async () =>
          ObjectLayerManagement.RenderTable({
            Elements: ElementsCyberiaPortal,
          }),
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

    s(`.main-btn-admin`).onclick = () => {
      const { protocol, hostname } = window.location;
      return (location.href = `${protocol}//${hostname}/admin${['', 0][random(0, 1)]}`);
    };
  },
};

export { MenuCyberiaPortal };
