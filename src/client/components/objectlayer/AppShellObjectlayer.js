import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, darkTheme, ThemeEvents, Themes } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import {
  buildBadgeToolTipMenuOption,
  isSubMenuOpen,
  Modal,
  SUBMENU_SELECTION_QUERY_KEY,
  renderMenuLabel,
  renderViewTitle,
  sortableSubMenuEvents,
  subMenuRender,
} from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath, setQueryParams } from '../core/Router.js';
import { AppStoreObjectlayer } from './AppStoreObjectlayer.js';
import Sortable from 'sortablejs';
import { RouterObjectlayer, BannerAppTemplate } from './RouterObjectlayer.js';
import { SettingsObjectlayer } from './SettingsObjectlayer.js';
import { Badge } from '../core/Badge.js';
import { Docs } from '../core/Docs.js';
import { deployPackageReleaseUrl } from '../core/Repository.js';
import { Recover } from '../core/Recover.js';
import { ObjectLayerEngineViewer } from '../object-layer/ObjectLayerEngineViewer.js';
import { MainBodyDocument } from '../core/MainBodyDocument.js';

class AppShellObjectlayer {
  static Data = {};
  static async instance() {
    const id = getId(AppShellObjectlayer.Data, 'menu-');
    AppShellObjectlayer.Data[id] = {};
    const RouterInstance = RouterObjectlayer.instance();

    const { barConfig } = await Themes[Css.currentTheme]();
    const barMode = 'top-bottom-bar';
    await Modal.instance({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/home.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="home"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-object-layer-engine-viewer',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img
                class="inl objectlayer-menu-icon"
                src="${getProxyPath()}assets/ui-icons/object-layer.png"
              />`,
              text: html`<span class="menu-label-text">${Translate.instance('object-layer-engine-viewer')}</span>`,
            }),
            attrs: `data-id="object-layer-engine-viewer"`,
            tabHref: `${getProxyPath()}object-layer-engine-viewer`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('object-layer-engine-viewer')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-in',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
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
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
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
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
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
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/account.png" />`,
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
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-docs',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl objectlayer-menu-icon" src="${getProxyPath()}assets/ui-icons/wiki.png" />`,
              text: html`<span class="menu-label-text"
                >${Translate.instance('docs')}
                <i
                  class="fas fa-caret-down inl down-arrow-submenu down-arrow-submenu-docs"
                  style="rotate: 0deg; transition: 0.4s;"
                ></i
              ></span>`,
            }),
            attrs: `data-id="docs"`,
            tabHref: `${getProxyPath()}docs`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('docs')),
          })}
          <div class="abs menu-btn-container-children-docs"></div>
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
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/ui-icons/object-layer.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      barMode,
      RouterInstance,
      htmlMainBody: async () => await MainBodyDocument.instance({ domain: 'object-layer' }),
      searchCustomImgClass: 'objectlayer-menu-icon',
    });

    const sortableSubMenus = sortableSubMenuEvents(['docs']);
    AppShellObjectlayer.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
      animation: 150,
      group: `menu-sortable`,
      forceFallback: true,
      fallbackOnBody: true,
      handle: '.handle-btn-container',
      draggable: '.main-btn-menu',
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
        sortableSubMenus.onEnd();
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
      onStart: sortableSubMenus.onStart,
    });

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<img
            class="inl objectlayer-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/sign-up.png"
          />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('sign-up')}</span>`,
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
          icon: html`<img
            class="inl objectlayer-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/log-out.png"
          />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('log-out')}</span>`,
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
          icon: html`<img class="inl objectlayer-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('log-in')}</span>`,
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
          icon: html`<img
            class="inl objectlayer-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/account.png"
          />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('account')}</span>`,
        }),
        html: async () =>
          await Account.instance({
            idModal: 'modal-account',
            user: AppStoreObjectlayer.Data.user.main.model.user,
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
          icon: html`<img
            class="inl objectlayer-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/settings.png"
          />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('settings')}</span>`,
        }),
        html: async () => await SettingsObjectlayer.instance({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-object-layer-engine-viewer`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-object-layer-engine-viewer',
        route: 'object-layer-engine-viewer',
        barConfig,
        title: renderViewTitle({
          icon: html`<img
            class="inl objectlayer-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/object-layer.png"
          />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('object-layer-engine-viewer')}</span>`,
        }),
        html: async () =>
          ObjectLayerEngineViewer.instance({ appStore: AppStoreObjectlayer, readOnly: true, lifecycle: true }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-docs`, async (e) => {
      if (!isSubMenuOpen('docs') || e.isTrusted) {
        if (e.isTrusted) setQueryParams({ [SUBMENU_SELECTION_QUERY_KEY]: '' });
        await subMenuRender('docs');
      }

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl objectlayer-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/wiki.png" />`,
          text: `<span class='inl objectlayer-text-title-modal'>${Translate.instance('docs')}</span>`,
        }),
        html: async () =>
          await Docs.instance({
            idModal: 'modal-docs',
            ...Docs.uiIcons({ iconClass: 'objectlayer-menu-icon' }),
            domain: 'object-layer',
            disabled: ['demo'],
            lastReleaseUrl: deployPackageReleaseUrl,
          }),
        handleType: 'bar',
        observer: true,
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
          text: Translate.instance('recover'),
        }),
        html: async () =>
          await Recover.instance({ idModal: 'modal-recover', user: AppStoreObjectlayer.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });
  }
}

export { AppShellObjectlayer };
