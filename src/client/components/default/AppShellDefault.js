import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, darkTheme, ThemeEvents, Themes } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath, getPublicRouteParam } from '../core/Router.js';
import { AppStoreDefault } from './AppStoreDefault.js';
import { RouterDefault, BannerAppTemplate } from './RouterDefault.js';
import { SettingsDefault } from './SettingsDefault.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { Page500 } from '../core/500.js';
import { Page404 } from '../core/404.js';
import { PanelForm } from '../core/PanelForm.js';
import { Chat } from '../core/Chat.js';
import { PublicProfile } from '../core/PublicProfile.js';

class AppShellDefault {
  static async instance(options = { htmlMainBody: () => html`` }) {
    const RouterInstance = RouterDefault.instance();
    const user = () => AppStoreDefault.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      entries: [
        { id: 'home', route: '', icon: html`<i class="fas fa-home"></i>`, active: true },
        {
          id: 'log-in',
          icon: html`<i class="fas fa-sign-in-alt"></i>`,
          view: () => ({ html: async () => await LogIn.instance() }),
        },
        {
          id: 'sign-up',
          icon: html`<i class="fas fa-user-plus"></i>`,
          view: () => ({ html: async () => await SignUp.instance({ idModal: 'modal-sign-up' }) }),
        },
        {
          id: 'log-out',
          icon: html`<i class="fas fa-sign-out-alt"></i>`,
          session: true,
          view: () => ({ html: async () => await LogOut.instance() }),
        },
        {
          id: 'account',
          icon: html`<i class="fas fa-user-circle"></i>`,
          session: true,
          view: () => ({
            html: async () => await Account.instance({ idModal: 'modal-account', user: user(), disabled: [] }),
          }),
        },
        {
          id: 'public-profile',
          route: 'u',
          icon: html`<i class="fas fa-user-tag"></i>`,
          session: true,
          action: async (e, open) => {
            const idModal = 'modal-public-profile';
            // `/u/:username`, or the signed-in user's own profile on a bare `/u`
            const username = getPublicRouteParam('profile') || user().username;
            if (s(`.${idModal}`) && username && username !== PublicProfile.currentUsername)
              return await PublicProfile.Update({ idModal, user: { username } });
            return await open({
              title: '',
              observer: true,
              html: async () => await PublicProfile.instance({ idModal, user: { username } }),
            });
          },
        },
        {
          id: 'settings',
          icon: html`<i class="fas fa-sliders-h"></i>`,
          view: () => ({ html: async () => await SettingsDefault.instance({ idModal: 'modal-settings' }) }),
        },
        {
          id: 'recover',
          icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
          hidden: true,
          view: () => ({ html: async () => await Recover.instance({ idModal: 'modal-recover', user: user() }) }),
        },
        {
          id: 'default-management',
          icon: html`<i class="fa-solid fa-rectangle-list"></i>`,
          view: () => ({ observer: true, html: async () => await DefaultManagement.instance() }),
        },
        {
          id: '404',
          icon: html`<i class="fa-solid fa-triangle-exclamation"></i>`,
          hidden: true,
          view: () => ({ observer: true, html: async () => await Page404.instance({ idModal: 'modal-404' }) }),
        },
        {
          id: '500',
          icon: html`<i class="fa-solid fa-circle-exclamation"></i>`,
          hidden: true,
          view: () => ({ observer: true, html: async () => await Page500.instance({ idModal: 'modal-500' }) }),
        },
        {
          id: 'blog',
          icon: html`<i class="fa-solid fa-file-invoice"></i>`,
          view: () => ({
            publicRoute: 'entry',
            observer: true,
            html: async () => {
              setTimeout(async () => {
                await PanelForm.instance({
                  idPanel: 'default-blog',
                  defaultUrlImage: `${getProxyPath()}android-chrome-96x96.png`,
                  appStore: AppStoreDefault,
                  parentIdModal: 'modal-blog',
                  scrollClassContainer: `html-modal-blog`,
                  route: 'blog',
                  entryHost: true,
                });
              });
            },
          }),
        },
        {
          id: 'chat',
          icon: html`<i class="far fa-comments"></i>`,
          badge: await Badge.instance({
            id: 'main-btn-chat',
            type: 'circle-red',
            classList: 'hide badge-notification-menu',
          }),
          view: () => ({ observer: true, html: async () => await Chat.instance({ idModal: 'modal-chat' }) }),
        },
      ],
    };

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: html`<div class="style-lading-render"></div>
        ${await ShellNavigation.render(navigation)}`,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
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
      htmlMainBody: options.htmlMainBody,
    });
    ShellNavigation.bind(navigation);

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
        const backgroundImage = `${getProxyPath()}assets/background/white.jpg`;
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
            min-height: calc(100vh - 100px);
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
            transition:
              transform 0.3s ease,
              box-shadow 0.3s ease;
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
  }
}

export { AppShellDefault };
