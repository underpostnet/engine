import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, darkTheme, ThemeEvents, Themes } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';
import Sortable from 'sortablejs';
import { RouterBymyelectrics, BannerAppTemplate } from './RouterBymyelectrics.js';
import { SettingsBymyelectrics } from './SettingsBymyelectrics.js';
import { Badge } from '../core/Badge.js';
import { Docs } from '../core/Docs.js';
import { Recover } from '../core/Recover.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { Page500 } from '../core/500.js';
import { Page404 } from '../core/404.js';

class AppShellBymyelectrics {
  static Data = {};
  static async instance(options = { htmlMainBody: () => html`` }) {
    const id = getId(AppShellBymyelectrics.Data, 'menu-');
    AppShellBymyelectrics.Data[id] = {};
    const RouterInstance = RouterBymyelectrics.instance();

    const { barConfig } = await Themes[Css.currentTheme]();

    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = undefined; // 'top-bottom-bar';
    await Modal.instance({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-home"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="home"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-in hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-in-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-sign-up hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-plus"></i>`,
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
              icon: html`<i class="fas fa-sign-out-alt"></i>`,
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
              icon: html`<i class="fas fa-user-circle"></i>`,
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
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-docs hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-book"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('docs')}</span>`,
            }),
            attrs: `data-id="docs"`,
            tabHref: `${getProxyPath()}docs`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('docs')),
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
            class: 'in wfa main-btn-menu main-btn-default-management hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('default-management')}</span>`,
            }),
            attrs: `data-id="default-management"`,
            tabHref: `${getProxyPath()}default-management`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('default-management')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-404 hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-triangle-exclamation"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('404')}</span>`,
            }),
            attrs: `data-id="404"`,
            tabHref: `${getProxyPath()}404`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('404')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-500 hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('500')}</span>`,
            }),
            attrs: `data-id="500"`,
            tabHref: `${getProxyPath()}500`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('500')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-dossier',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-regular fa-file-lines"></i>`,
              text: html`<span class="menu-label-text">${Translate.instance('dossier')}</span>`,
            }),
            attrs: `data-id="dossier"`,
            tabHref: `${getProxyPath()}docs/Dossier-By-My-Electrics-2025.pdf`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('dossier')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      slideMenuTopBarBannerFix: async () => {
        return html` <style>
            .bme-bar-logo {
              height: 150px;
              padding-left: 20px;
              top: -25px;
            }
            .slide-menu-top-bar-fix {
              overflow: hidden;
            }
          </style>

          <div class="fl">
            <img
              class="in fll bme-bar-logo ${!darkTheme ? '' : 'negative-color'}"
              src="${getProxyPath()}assets/social.png"
            />
          </div>`;
      },
      title: BannerAppTemplate,
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
      htmlMainBody: options?.htmlMainBody ? options.htmlMainBody : undefined,
    });

    AppShellBymyelectrics.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
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
      await Modal.instance({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-user-plus"></i>`,
          text: Translate.instance('sign-up'),
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
          icon: html`<i class="fas fa-sign-out-alt"></i>`,
          text: Translate.instance('log-out'),
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
          icon: html`<i class="fas fa-sign-in-alt"></i>`,
          text: Translate.instance('log-in'),
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
          icon: html`<i class="fas fa-user-circle"></i>`,
          text: Translate.instance('account'),
        }),
        html: async () =>
          await Account.instance({
            idModal: 'modal-account',
            user: AppStoreBymyelectrics.Data.user.main.model.user,
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
          icon: html` <i class="fas fa-sliders-h"></i>`,
          text: Translate.instance('settings'),
        }),
        html: async () => await SettingsBymyelectrics.instance({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-docs`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-book"></i>`,
          text: Translate.instance('docs'),
        }),
        html: async () =>
          await Docs.instance({
            idModal: 'modal-docs',
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
          await Recover.instance({ idModal: 'modal-recover', user: AppStoreBymyelectrics.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-default-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-default-management',
        route: 'default-management',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
          text: Translate.instance('default-management'),
        }),
        html: async () => await DefaultManagement.RenderTable(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-404`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-404',
        route: '404',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-triangle-exclamation"></i>`,
          text: Translate.instance('404'),
        }),
        html: async () => await Page404.instance({ idModal: 'modal-404' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });

    EventsUI.onClick(`.main-btn-500`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-500',
        route: '500',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
          text: Translate.instance('500'),
        }),
        html: async () => await Page500.instance({ idModal: 'modal-500' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
      });
    });
    EventsUI.onClick(`.main-btn-dossier`, async () => {
      location.href = `${getProxyPath()}docs/Dossier-By-My-Electrics-2025.pdf`;
    });
  }
}

export { AppShellBymyelectrics };
