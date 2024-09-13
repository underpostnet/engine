import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import Sortable from 'sortablejs';
import { RouterUnderpost } from './RoutesUnderpost.js';
import { LabGalleryUnderpost } from './LabGalleryUnderpost.js';
import { CyberpunkBloggerUnderpost } from './CyberpunkBloggerUnderpost.js';
import { Badge } from '../core/Badge.js';
import { SettingsUnderpost } from './SettingsUnderpost.js';
import { Recover } from '../core/Recover.js';
import { Panel } from '../core/Panel.js';

const MenuUnderpost = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterUnderpost();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = undefined; // 'top-bottom-bar';
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-contracultura-cyberpunk',
            label: renderMenuLabel({
              icon: html`<i class="fa-brands fa-blogger"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('contracultura-cyberpunk')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="contracultura-cyberpunk"`,
            tabHref: `${getProxyPath()}contracultura-cyberpunk`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-lab-gallery',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-photo-film"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('lab-gallery')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="lab-gallery"`,
            tabHref: `${getProxyPath()}lab-gallery`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog')),
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
            style: 'display: none',
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-out')),
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
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/splash/mstile-144x144.png`;
          htmls(
            '.action-btn-app-icon-render',
            html`<img class="inl top-bar-app-icon ${darkTheme ? '' : `negative-color`}" src="${srcLogo}" />`,
          );
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      heightTopBar,
      heightBottomBar,
      htmlMainBody: async function () {
        const idPanel = 'underpost-panel';
        const formData = [
          {
            id: 'panel-title',
            model: 'title',
            inputType: 'text',
            rules: [{ type: 'isEmpty' }],
            panel: { type: 'title' },
          },
          {
            id: 'panel-description',
            model: 'description',
            inputType: 'text',
            panel: { type: 'subtitle' },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'panel-body',
            model: 'body',
            inputType: 'text',
            panel: {
              type: 'info-row-pin',
              icon: {
                value: html``,
              },
              newIcon: {
                key: html``,
              },
            },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'panel-footer',
            model: 'footer',
            inputType: 'text',
            panel: { type: 'info-row' },
            rules: [],
          },
        ];
        const data = [];

        return await Panel.Render({
          idPanel,
          formData,
          heightTopBar,
          heightBottomBar,
          data,
          scrollClassContainer: 'main-body',
          titleIcon: html`<i class="fa-solid fa-quote-left"></i>`,
          formContainerClass: 'session-in-log-in',
          callBackPanelRender: async function (
            options = { data, imgRender: async ({ imageUrl }) => null, htmlRender: async ({ render }) => null },
          ) {
            return await options.htmlRender({ render: 'test' });
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

    EventsUI.onClick(`.main-btn-lab-gallery`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-lab-gallery',
        route: 'lab-gallery',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-photo-film"></i>`,
          text: Translate.Render('lab-gallery'),
        }),
        html: async () => await LabGalleryUnderpost.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-contracultura-cyberpunk`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-contracultura-cyberpunk',
        route: 'contracultura-cyberpunk',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-brands fa-blogger"></i>`,
          text: Translate.Render('contracultura-cyberpunk'),
        }),
        html: async () => await CyberpunkBloggerUnderpost.Render(),
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
            user: ElementsUnderpost.Data.user.main.model.user,
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
        html: async () => await SettingsUnderpost.Render({ idModal: 'modal-settings' }),
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
          await Recover.Render({ idModal: 'modal-recover', user: ElementsUnderpost.Data.user.main.model.user }),
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

export { MenuUnderpost };
