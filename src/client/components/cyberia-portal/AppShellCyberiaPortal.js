import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance, random } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { Docs } from '../core/Docs.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import {
  buildBadgeToolTipMenuOption,
  isSubMenuOpen,
  Modal,
  renderMenuLabel,
  renderViewTitle,
  subMenuRender,
} from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath, setQueryParams } from '../core/Router.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';
import Sortable from 'sortablejs';
import { RouterCyberiaPortal, BannerAppTemplate } from './RoutesCyberiaPortal.js';
import { SettingsCyberiaPortal } from './SettingsCyberiaPortal.js';
import { Chat } from '../core/Chat.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { ObjectLayerEngineModal } from '../cyberia/ObjectLayerEngineModal.js';
import { ObjectLayerEngineViewer } from '../cyberia/ObjectLayerEngineViewer.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';
import { MainBodyCyberiaPortal } from './MainBodyCyberiaPortal.js';
import { MapEngineCyberia } from '../cyberia/MapEngineCyberia.js';
import { InstanceEngineCyberia } from '../cyberia/InstanceEngineCyberia.js';

class AppShellCyberiaPortal {
  static Data = {};
  static async instance() {
    const id = getId(AppShellCyberiaPortal.Data, 'menu-');
    AppShellCyberiaPortal.Data[id] = {};
    const RouterInstance = RouterCyberiaPortal();

    const { barConfig } = await Themes[Css.currentTheme]();

    await Modal.instance({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/home.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="0"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-in',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-sign-up',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('sign-up')}</span>`,
            }),
            attrs: `data-id="sign-up"`,
            tabHref: `${getProxyPath()}sign-up`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('sign-up')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-out',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('log-out')}</span>`,
            }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('log-out')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-account',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/account.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('account')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="account"`,
            tabHref: `${getProxyPath()}account`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('account')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-settings',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-server hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-server"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('server')}</span>`,
            }),
            attrs: `data-id="server"`,
            tabHref: `${getProxyPath()}server`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('server')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-chat',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/chat.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('chat')}</span>`,
            }),
            attrs: `data-id="chat"`,
            tabHref: `${getProxyPath()}chat`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('chat')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-docs',
            useMenuBtn: true,
            label: html`<div class="in">
              ${renderMenuLabel({
                icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/wiki.png" />`,
                text: html`<span class="menu-label-text"
                  >${Translate.instance('docs')}
                  <i
                    class="fas fa-caret-down inl down-arrow-submenu down-arrow-submenu-docs"
                    style="rotate: 0deg; transition: 0.4s;"
                  ></i
                ></span>`,
              })}
            </div> `,
            attrs: `data-id="docs"`,
            tabHref: `${getProxyPath()}docs`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('docs')),
          })}
          <div class="abs menu-btn-container-children-docs"></div>
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-admin hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-user-tie"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('admin')}</span>`,
            }),
            attrs: `data-id="admin"`,
            tabHref: `/admin`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('admin')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-recover hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('recover')}</span>`,
            }),
            attrs: `data-id="recover"`,
            tabHref: `${getProxyPath()}recover`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('recover')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-object-layer-engine',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('object-layer-engine')}</span>`,
            }),
            attrs: `data-id="object-layer-engine"`,
            tabHref: `${getProxyPath()}object-layer-engine`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('object-layer-engine')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-object-layer-engine-management hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('object-layer-engine-management')}</span>`,
            }),
            attrs: `data-id="object-layer-engine-management"`,
            tabHref: `${getProxyPath()}object-layer-engine-management`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('object-layer-engine-management')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-object-layer-engine-viewer',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('object-layer-engine-viewer')}</span>`,
            }),
            attrs: `data-id="object-layer-engine-viewer"`,
            tabHref: `${getProxyPath()}object-layer-engine-viewer`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('object-layer-engine-viewer')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-cyberia-map-engine',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('cyberia-map-engine')}</span>`,
            }),
            attrs: `data-id="cyberia-map-engine"`,
            tabHref: `${getProxyPath()}cyberia-map-engine`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('cyberia-map-engine')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-cyberia-instance-engine',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('cyberia-instance-engine')}</span>`,
            }),
            attrs: `data-id="cyberia-instance-engine"`,
            tabHref: `${getProxyPath()}cyberia-instance-engine`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('cyberia-instance-engine')),
          })}
        </div>
      `,
      // htmlMainBody: async () => {
      //   return '';
      //   return await ServerCyberiaPortal.instance({
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
      htmlMainBody: async () => await MainBodyCyberiaPortal.instance(),
      mode: 'slide-menu',
      RouterInstance,
      searchCustomImgClass: 'cyberia-menu-icon',
    });

    AppShellCyberiaPortal.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
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
      await Modal.instance({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('sign-up')}</span>`,
        }),
        html: async () => await SignUp.instance({ idModal: 'modal-sign-up' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('log-out')}</span>`,
        }),
        html: async () => await LogOut.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('log-in')}</span>`,
        }),
        html: async () => await LogIn.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/account.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('account')}</span>`,
        }),
        html: async () =>
          await Account.instance({
            idModal: 'modal-account',
            user: AppStoreCyberiaPortal.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('settings')}</span>`,
        }),
        html: async () => await SettingsCyberiaPortal.instance({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-chat`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-chat',
        route: 'chat',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/chat.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('chat')}</span>`,
        }),
        html: async () => await Chat.instance({ idModal: 'modal-chat' }),
        handleType: 'bar',
        maximize: true,
        observer: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-docs`, async (e) => {
      if (!isSubMenuOpen('docs') || e.isTrusted) {
        if (e.isTrusted) setQueryParams({ cid: '' });
        await subMenuRender('docs');
      }

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/wiki.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('docs')}</span>`,
        }),
        html: async () =>
          await Docs.instance({
            idModal: 'modal-docs',
            subMenuIcon: (type) =>
              html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/arrow-right.png" />`,
            coverageUrl: () => `${getProxyPath()}docs/hardhat-coverage`,
            demoUrl: () => `https://client.cyberiaonline.com/`,
            lastReleaseUrl: () => `https://github.com/underpostnet/engine-cyberia.git`,
          }),
        handleType: 'bar',
        observer: true,
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-server`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-server',
        route: 'server',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-server"></i>`,
          text: Translate.instance('server'),
        }),
        html: async () => '',
        // await ServerCyberiaPortal.instance({
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
      });
    });

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/update.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('recover')}</span>`,
        }),
        html: async () =>
          await Recover.instance({ idModal: 'modal-recover', user: AppStoreCyberiaPortal.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-object-layer-engine`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-object-layer-engine',
        route: 'object-layer-engine',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal' > ${Translate.instance('object-layer-engine')}</span>`,
        }),
        html: async () =>
          await ObjectLayerEngineModal.instance({
            idModal: 'modal-object-layer-engine',
            appStore: AppStoreCyberiaPortal,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-object-layer-engine-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-object-layer-engine-management',
        route: 'object-layer-engine-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('object-layer-engine-management')}</span>`,
        }),
        html: async () =>
          ObjectLayerManagement.RenderTable({
            appStore: AppStoreCyberiaPortal,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-object-layer-engine-viewer`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-object-layer-engine-viewer',
        route: 'object-layer-engine-viewer',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('object-layer-engine-viewer')}</span>`,
        }),
        html: async () =>
          ObjectLayerEngineViewer.instance({
            appStore: AppStoreCyberiaPortal,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-cyberia-map-engine`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-cyberia-map-engine',
        route: 'cyberia-map-engine',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('cyberia-map-engine')}</span>`,
        }),
        html: async () => await MapEngineCyberia.render({ appStore: AppStoreCyberiaPortal }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-cyberia-instance-engine`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-cyberia-instance-engine',
        route: 'cyberia-instance-engine',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl cyberia-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/engine.png" />`,
          text: `<span class='inl cyberia-text-title-modal'>${Translate.instance('cyberia-instance-engine')}</span>`,
        }),
        html: async () => await InstanceEngineCyberia.render({ appStore: AppStoreCyberiaPortal }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    s(`.main-btn-admin`).onclick = () => {
      const { protocol, hostname } = window.location;
      return (location.href = `${protocol}//${hostname}/admin${['', 0][random(0, 1)]}`);
    };
  }
}

export { AppShellCyberiaPortal };
