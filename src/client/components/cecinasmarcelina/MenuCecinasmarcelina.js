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
import { extractUsernameFromPath, getProxyPath, getQueryParams } from '../core/Router.js';
import { AppStoreCecinasmarcelina } from './AppStoreCecinasmarcelina.js';
import Sortable from 'sortablejs';
import { RouterCecinasmarcelina, BannerAppTemplate } from './RoutesCecinasmarcelina.js';
import { SettingsCecinasmarcelina } from './SettingsCecinasmarcelina.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { Page500 } from '../core/500.js';
import { Page404 } from '../core/404.js';
import { PanelForm } from '../core/PanelForm.js';
import { Chat } from '../core/Chat.js';
import { PublicProfile } from '../core/PublicProfile.js';

const MenuCecinasmarcelina = {
  Data: {},
  Render: async function (options = { htmlMainBody: () => html`` }) {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterCecinasmarcelina();

    const { barConfig } = await Themes[Css.currentTheme]();

    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = undefined; // 'top-bottom-bar';
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="style-lading-render"></div>
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
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
            useMenuBtn: true,
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
            useMenuBtn: true,
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
            useMenuBtn: true,
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
            useMenuBtn: true,
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
            class: 'in wfa main-btn-menu main-btn-public-profile',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-tag"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('public-profile')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="public-profile"`,
            tabHref: `${getProxyPath()}u`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('public-profile')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-settings',
            useMenuBtn: true,
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
            class: 'in wfa main-btn-menu main-btn-404 hide',
            useMenuBtn: true,
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
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('500')}</span>`,
            }),
            attrs: `data-id="500"`,
            tabHref: `${getProxyPath()}500`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('500')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-blog',
            useMenuBtn: true,
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
            class: 'in wfa main-btn-menu main-btn-chat',
            useMenuBtn: true,
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
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('chat')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      slideMenuTopBarBannerFix: async () => {
        return html` <style>
            .cm-bar-logo {
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
              class="in fll cm-bar-logo ${darkTheme ? 'negative-color' : ''}"
              src="${getProxyPath()}assets/logo/ico.webp"
            />
          </div>`;
      },
      title: BannerAppTemplate,
      // titleClass: 'hide',
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/logo/base-icon.png`;

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
      htmlMainBody: options.htmlMainBody,
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
          .landing-page {
            font-family:
              'Segoe UI',
              system-ui,
              -apple-system,
              sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 1rem;
            color: ${darkTheme ? '#f5ddd0' : '#3d1111'};
          }

          /* Hero - full width background */
          .hero-section {
            position: relative;
            text-align: center;
            padding: 0;
            margin: 0 -1rem;
            min-height: 480px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image: url('${getProxyPath()}assets/background/hero.webp');
            background-size: cover;
            background-position: center;
            border-radius: 0 0 16px 16px;
            overflow: hidden;
          }
          .hero-overlay {
            position: absolute;
            inset: 0;
            background: ${darkTheme
            ? 'linear-gradient(180deg, rgba(26,10,10,0.85) 0%, rgba(61,17,17,0.75) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(245,221,208,0.82) 100%)'};
          }
          .hero-inner {
            position: relative;
            z-index: 1;
            padding: 4rem 2rem;
            max-width: 700px;
          }
          .hero-logo {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 20px ${darkTheme ? 'rgba(0,0,0,0.5)' : 'rgba(139,69,19,0.25)'};
            ${darkTheme ? 'filter: brightness(1.1);' : ''}
          }
          .hero-title {
            font-size: 2.6rem;
            margin-bottom: 0.75rem;
            line-height: 1.2;
            background: linear-gradient(
              135deg,
              ${darkTheme ? '#c0392b' : '#8b4513'},
              ${darkTheme ? '#e74c3c' : '#a0522d'}
            );
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .hero-subtitle {
            font-size: 1.2rem;
            font-weight: 600;
            color: ${darkTheme ? '#e8a87c' : '#8b4513'};
            margin-bottom: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .hero-description {
            font-size: 1.05rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            margin-bottom: 2rem;
            font-style: italic;
          }
          .hero-cta {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1.5rem;
          }
          .btn {
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1rem;
          }
          .btn:hover {
            transform: translateY(-2px);
          }
          .btn-primary {
            background: ${darkTheme ? '#8b0000' : '#8b4513'};
            color: #fff;
            border: 2px solid ${darkTheme ? '#8b0000' : '#8b4513'};
          }
          .btn-primary:hover {
            background: ${darkTheme ? '#a02020' : '#a0522d'};
            border-color: ${darkTheme ? '#a02020' : '#a0522d'};
            color: #fff;
          }
          .btn-outline {
            background: transparent;
            color: ${darkTheme ? '#c0392b' : '#8b4513'};
            border: 2px solid ${darkTheme ? '#c0392b' : '#8b4513'};
          }
          .btn-outline:hover {
            background: ${darkTheme ? '#c0392b' : '#8b4513'};
            color: #fff;
          }

          /* Section lead */
          .section-lead {
            font-size: 1.05rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            max-width: 650px;
            margin: -1.5rem auto 2.5rem;
            font-style: italic;
          }

          /* Products */
          .products-section {
            padding: 4rem 1rem;
            text-align: center;
          }
          .products-section h2,
          .pillars-section h2,
          .about-section h2 {
            font-size: 2rem;
            margin-bottom: 2.5rem;
            color: ${darkTheme ? '#e74c3c' : '#8b4513'};
          }
          .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
          }
          .product-card {
            background: ${darkTheme ? 'rgba(61, 17, 17, 0.5)' : '#fff'};
            padding: 2rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 15px ${darkTheme ? 'rgba(0,0,0,0.3)' : 'rgba(139,69,19,0.1)'};
            transition:
              transform 0.3s ease,
              box-shadow 0.3s ease;
          }
          .product-card:hover {
            box-shadow: 0 10px 30px ${darkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(139,69,19,0.2)'};
          }
          .product-icon {
            font-size: 2.5rem;
            margin-bottom: 0.75rem;
          }
          .product-card h3 {
            font-size: 1.15rem;
            margin-bottom: 0.5rem;
            color: ${darkTheme ? '#f5ddd0' : '#3d1111'};
          }
          .product-card p {
            font-size: 0.95rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            line-height: 1.5;
          }

          /* About */
          .about-section {
            padding: 4rem 2rem;
            text-align: center;
            background: ${darkTheme ? 'rgba(61, 17, 17, 0.3)' : 'rgba(245, 221, 208, 0.35)'};
            border-radius: 16px;
            margin: 2rem 0;
          }
          .about-tagline {
            font-size: 1.2rem;
            font-weight: 600;
            color: ${darkTheme ? '#e8a87c' : '#8b4513'};
            margin-bottom: 1.5rem;
          }
          .about-content p {
            font-size: 1rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            max-width: 750px;
            margin: 0 auto 1rem;
            line-height: 1.7;
          }

          /* Pillars */
          .pillars-section {
            padding: 4rem 1rem;
            text-align: center;
          }
          .pillars-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
          }
          .pillar-card {
            background: ${darkTheme ? 'rgba(61, 17, 17, 0.5)' : '#fff'};
            padding: 2rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 15px ${darkTheme ? 'rgba(0,0,0,0.3)' : 'rgba(139,69,19,0.1)'};
            transition:
              transform 0.3s ease,
              box-shadow 0.3s ease;
          }
          .pillar-card:hover {
            box-shadow: 0 10px 30px ${darkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(139,69,19,0.2)'};
          }
          .pillar-icon {
            font-size: 2.5rem;
            margin-bottom: 0.75rem;
          }
          .pillar-card h3 {
            font-size: 1.15rem;
            margin-bottom: 0.5rem;
            color: ${darkTheme ? '#f5ddd0' : '#3d1111'};
          }
          .pillar-card p {
            font-size: 0.95rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            line-height: 1.5;
          }

          /* Location */
          .location-section {
            padding: 4rem 1rem;
            text-align: center;
            background: ${darkTheme ? 'rgba(61, 17, 17, 0.3)' : 'rgba(245, 221, 208, 0.4)'};
            border-radius: 16px;
            margin: 2rem 0;
          }
          .location-section h2 {
            font-size: 2rem;
            color: ${darkTheme ? '#e74c3c' : '#8b4513'};
            margin-bottom: 0.5rem;
          }
          .location-tagline {
            font-size: 1.15rem;
            font-weight: 600;
            color: ${darkTheme ? '#e8a87c' : '#8b4513'};
            margin-bottom: 1rem;
            font-style: italic;
          }
          .location-description {
            font-size: 1.05rem;
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            max-width: 700px;
            margin: 0 auto;
          }

          /* Contact */
          .contact-section {
            padding: 4rem 1rem;
            text-align: center;
          }
          .contact-section h2 {
            font-size: 2rem;
            color: ${darkTheme ? '#e74c3c' : '#8b4513'};
            margin-bottom: 2rem;
          }
          .contact-info {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem;
          }
          .contact-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1.1rem;
            color: ${darkTheme ? '#f5ddd0' : '#3d1111'};
          }
          .contact-item i {
            color: ${darkTheme ? '#c0392b' : '#8b4513'};
            font-size: 1.3rem;
          }

          /* Footer */
          .landing-footer {
            padding: 2rem 1rem;
            margin-top: 4rem;
            text-align: center;
            border-top: 1px solid ${darkTheme ? 'rgba(139,0,0,0.3)' : 'rgba(139,69,19,0.2)'};
            color: ${darkTheme ? '#c4a08a' : '#6b4423'};
            font-size: 0.9rem;
          }

          @media (max-width: 767px) {
            .hero-title {
              font-size: 2rem;
            }
            .hero-section {
              min-height: 400px;
            }
            .hero-inner {
              padding: 3rem 1.5rem;
            }
            .hero-logo {
              width: 90px;
              height: 90px;
            }
            .products-grid,
            .pillars-grid {
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
            user: AppStoreCecinasmarcelina.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-public-profile`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      const idModal = 'modal-public-profile';
      const user = AppStoreCecinasmarcelina.Data.user.main.model.user;

      // Check if modal already exists
      const existingModal = s(`.${idModal}`);
      if (existingModal) {
        const usernameFromPath = extractUsernameFromPath();
        const queryParams = getQueryParams();
        const cid = usernameFromPath || queryParams.cid || user.username || null;
        if (cid) {
          await PublicProfile.Update({
            idModal: 'modal-public-profile',
            user: { username: cid },
          });
          return;
        }
      }

      await Modal.Render({
        id: idModal,
        route: 'u',
        barConfig,
        title: '',
        //   renderViewTitle({
        //   icon: html`<i class="fas fa-user-circle"></i>`,
        //   text: Translate.Render('public-profile'),
        // }),
        html: async () =>
          await PublicProfile.Render({
            idModal,
            user,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        observer: true,
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
        html: async () => await SettingsCecinasmarcelina.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
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
          await Recover.Render({ idModal: 'modal-recover', user: AppStoreCecinasmarcelina.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
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
        observer: true,
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
              idPanel: 'cecinasmarcelina-blog',
              cecinasmarcelinaUrlImage: `${getProxyPath()}android-chrome-96x96.png`,
              appStore: AppStoreCecinasmarcelina,
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
        barMode,
      });
    });
  },
};

export { MenuCecinasmarcelina };
