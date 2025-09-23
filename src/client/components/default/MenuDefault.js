import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import {
  borderChar,
  boxShadow,
  Css,
  darkTheme,
  extractBackgroundImageUrl,
  renderCssAttr,
  ThemeEvents,
  Themes,
} from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { ElementsDefault } from './ElementsDefault.js';
import Sortable from 'sortablejs';
import { RouterDefault, BannerAppTemplate } from './RoutesDefault.js';
import { SettingsDefault } from './SettingsDefault.js';
import { Badge } from '../core/Badge.js';
import { Docs } from '../core/Docs.js';
import { Recover } from '../core/Recover.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { Page500 } from '../core/500.js';
import { Page404 } from '../core/404.js';

const MenuDefault = {
  Data: {},
  Render: async function (options = { htmlMainBody: () => html`` }) {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterDefault();

    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = undefined; // 'top-bottom-bar';
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="style-lading-render"></div>
        <div class="fl menu-btn-container">
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
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-default-management',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('default-management')}</span>`,
            }),
            attrs: `data-id="default-management"`,
            tabHref: `${getProxyPath()}default-management`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('default-management')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-404 hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-triangle-exclamation"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('404')}</span>`,
            }),
            attrs: `data-id="404"`,
            tabHref: `${getProxyPath()}404`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('404')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-500 hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('500')}</span>`,
            }),
            attrs: `data-id="500"`,
            tabHref: `${getProxyPath()}500`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('500')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}apple-touch-icon-114x114-precomposed.png`;

          htmls(
            '.action-btn-app-icon-render',
            html`<img class="inl top-bar-app-icon ${darkTheme ? 'negative-color' : ''}" src="${srcLogo}" />`,
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
          EventsUI.onClick('.get-started-button', (e) => {
            e.preventDefault();
            location.href = `https://www.nexodev.org/docs/?cid=src`;
          });
        });
        return html`
          <div class="landing-container">
            <div class="content-wrapper">
              <h1 class="animated-text">
                <span class="greeting">Hello, World!</span>
                <span class="subtitle">Welcome to Our Platform</span>
              </h1>

              <div class="features">
                <div class="feature-card">
                  <i class="icon">🚀</i>
                  <h3>Fast & Reliable</h3>
                  <p>Lightning-fast performance with 99.9% uptime</p>
                </div>
                <div class="feature-card">
                  <i class="icon">🎨</i>
                  <h3>Beautiful UI</h3>
                  <p>Modern and intuitive user interface</p>
                </div>
                <div class="feature-card">
                  <i class="icon">⚡</i>
                  <h3>Powerful Features</h3>
                  <p>Everything you need in one place</p>
                </div>
              </div>

              <button class="cta-button get-started-button">
                Get Started
                <span class="button-icon">→</span>
              </button>
            </div>
          </div>
        `;
      },
    });

    ThemeEvents['main-theme-handler'] = () => {
      if (darkTheme) {
        const backgroundImage = `${getProxyPath()}assets/background/dark.svg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
            }
          `,
        );
      } else {
        const backgroundImage = `${getProxyPath()}assets/background/white0-min.jpg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
            }
          `,
        );
      }
      htmls(
        `.style-lading-render`,
        html` <style>
          .landing-container {
            min-height: calc(100vh - ${heightTopBar + heightBottomBar}px);
            display: flex;
            /*    align-items: center; */
            justify-content: center;

            padding: 2rem;
            color: ${darkTheme ? '#fff' : '#333'};
            transition: all 0.3s ease;
          }

          .content-wrapper {
            text-align: center;
            max-width: 1200px;
            width: 100%;
            padding: 2rem;
            animation: fadeIn 1s ease-out;
          }

          .animated-text {
            margin-bottom: 3rem;
          }

          .greeting {
            display: block;
            font-size: 3.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: slideIn 1s ease-out;
          }

          .subtitle {
            display: block;
            font-size: 1.5rem;
            color: ${darkTheme ? '#a0aec0' : '#4a5568'};
            margin-top: 1rem;
            opacity: 0;
            animation: fadeInUp 0.8s ease-out 0.3s forwards;
          }

          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin: 4rem 0;
          }

          .feature-card {
            background: ${darkTheme ? 'rgba(255, 255, 255, 0.05)' : 'white'};
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            opacity: 0;
            animation: fadeInUp 0.6s ease-out forwards;
          }

          .feature-card:nth-child(1) {
            animation-delay: 0.5s;
          }
          .feature-card:nth-child(2) {
            animation-delay: 0.7s;
          }
          .feature-card:nth-child(3) {
            animation-delay: 0.9s;
          }

          .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
          }

          .feature-card .icon {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            display: inline-block;
          }

          .feature-card h3 {
            font-size: 1.25rem;
            margin-bottom: 0.75rem;
            color: ${darkTheme ? '#e2e8f0' : '#2d3748'};
          }

          .feature-card p {
            color: ${darkTheme ? '#a0aec0' : '#4a5568'};
            line-height: 1.6;
          }

          .cta-button {
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            color: white;
            border: none;
            padding: 1rem 2.5rem;
            font-size: 1.1rem;
            border-radius: 50px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
            opacity: 0;
            animation: fadeIn 0.8s ease-out 1.2s forwards;
          }

          .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
            background: linear-gradient(90deg, #3e38b4, #602bbc);
            color: white;
          }

          .cta-button:active {
            transform: translateY(0);
          }

          .button-icon {
            transition: transform 0.3s ease;
          }

          .cta-button:hover .button-icon {
            transform: translateX(4px);
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(-30px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @media (max-width: 768px) {
            .greeting {
              font-size: 2.5rem;
            }

            .subtitle {
              font-size: 1.25rem;
            }

            .features {
              grid-template-columns: 1fr;
            }
          }
        </style>`,
      );
    };

    setTimeout(ThemeEvents['main-theme-handler']);

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
            user: ElementsDefault.Data.user.main.model.user,
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
        html: async () => await SettingsDefault.Render({ idModal: 'modal-settings' }),
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
          await Recover.Render({ idModal: 'modal-recover', user: ElementsDefault.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
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
      });
    });

    EventsUI.onClick(`.main-btn-404`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-404',
        route: '404',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-triangle-exclamation"></i>`,
          text: Translate.Render('404'),
        }),
        html: async () => await Page404.Render({ idModal: 'modal-404' }),
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

    EventsUI.onClick(`.main-btn-500`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-500',
        route: '500',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
          text: Translate.Render('500'),
        }),
        html: async () => await Page500.Render({ idModal: 'modal-500' }),
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
  },
};

export { MenuDefault };
