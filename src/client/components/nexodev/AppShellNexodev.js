import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, boxShadow, darkTheme, subThemeManager, darkenHex, lightenHex } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls } from '../core/VanillaJs.js';
import { AppStoreNexodev } from './AppStoreNexodev.js';
import { RouterNexodev, BannerAppTemplate } from './RouterNexodev.js';
import { CalendarNexodev } from './CalendarNexodev.js';
import { DashboardNexodev } from './DashboardNexodev.js';
import { StreamNexodev } from './StreamNexodev.js';
import { Docs } from '../core/Docs.js';
import { Content } from '../core/Content.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Chat } from '../core/Chat.js';
import { SettingsNexodev } from './SettingsNexodev.js';
import { Badge } from '../core/Badge.js';
import { Recover } from '../core/Recover.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { InstanceManagement } from '../../services/instance/instance.management.js';
import { UserManagement } from '../../services/user/user.management.js';
import { PanelForm } from '../core/PanelForm.js';
import { getProxyPath, getPublicRouteParam } from '../core/Router.js';
import { CronManagement } from '../../services/cron/cron.management.js';
import { Translate } from '../core/Translate.js';

const cronIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
  <path
    fill="currentColor"
    d="M22.8 19.4c.1 0 .1.1 0 .2l-1 1.7c-.1.1-.2.1-.3.1l-1.2-.4c-.3.2-.5.3-.8.5l-.2 1.3c0 .1-.1.2-.2.2h-2c-.1 0-.2-.1-.3-.2l-.2-1.3c-.3-.1-.6-.3-.8-.5l-1.2.5c-.1 0-.2 0-.3-.1l-1-1.7c-.1-.1 0-.2.1-.3l1.1-.8v-1l-1.1-.8c-.1-.1-.1-.2-.1-.3l1-1.7c.1-.1.2-.1.3-.1l1.2.5c.3-.2.5-.3.8-.5l.2-1.3c0-.1.1-.2.3-.2h2c.1 0 .2.1.2.2l.2 1.3c.3.1.6.3.9.5l1.2-.5c.1 0 .3 0 .3.1l1 1.7c.1.1 0 .2-.1.3l-1.1.8v1zM19.5 18c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5s.7 1.5 1.5 1.5s1.5-.7 1.5-1.5M13 14V8h-2v6m4-13H9v2h6zm-3.7 19C7.8 19.6 5 16.6 5 13c0-3.9 3.1-7 7-7c3.2 0 5.9 2.1 6.7 5c.8.1 1.5.3 2.2.6c-.3-1.6-.9-3-1.9-4.2L20.5 6c-.5-.5-1-1-1.5-1.4L17.6 6c-1.5-1.3-3.5-2-5.6-2c-5 0-9 4-9 9s4 9 9 9h.3c-.5-.6-.8-1.3-1-2"
  />
</svg>`;

class AppShellNexodev {
  static async instance(options = { htmlMainBody: () => '' }) {
    const RouterInstance = RouterNexodev.instance();
    const user = () => AppStoreNexodev.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      entries: [
        {
          id: 'blog',
          icon: html`<i class="fa-solid fa-file-invoice"></i>`,
          view: () => ({
            publicRoute: 'entry',
            observer: true,
            html: async () => {
              setTimeout(async () => {
                await PanelForm.instance({
                  idPanel: 'nexodev-blog',
                  defaultUrlImage: `${getProxyPath()}android-chrome-96x96.png`,
                  appStore: AppStoreNexodev,
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
          id: 'calendar',
          icon: html`<i class="fas fa-calendar-alt"></i>`,
          view: () => ({
            observer: true,
            html: async () =>
              await CalendarNexodev.instance({
                idModal: 'modal-calendar',
                appStore: AppStoreNexodev,
                route: 'calendar',
                parentIdModal: 'modal-calendar',
              }),
          }),
        },
        {
          id: 'dashboard',
          icon: html`<i class="fa-solid fa-chart-line"></i>`,
          view: () => ({ html: async () => await DashboardNexodev.instance({ idModal: 'modal-dashboard' }) }),
        },
        {
          id: 'stream',
          icon: html`<i class="fa-solid fa-video"></i>`,
          view: () => ({ html: async () => await StreamNexodev.instance({ idModal: 'modal-stream' }) }),
        },
        {
          id: 'docs',
          icon: html`<i class="fas fa-book"></i>`,
          submenu: true,
          view: () => ({ observer: true, html: async () => await Docs.instance({ idModal: 'modal-docs' }) }),
        },
        {
          id: 'content',
          icon: html`<i class="far fa-file"></i>`,
          view: () => {
            const stableSlug = getPublicRouteParam('content');
            const idModal = `modal-content${stableSlug ? `-${stableSlug}` : ''}`;
            return { id: idModal, observer: true, html: async () => await Content.instance({ idModal, stableSlug }) };
          },
        },
        {
          id: 'cloud',
          icon: html`<i class="fas fa-cloud"></i>`,
          view: () => ({ html: async () => await FileExplorer.instance({ idModal: 'modal-cloud' }) }),
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
        {
          id: 'settings',
          icon: html`<i class="fas fa-sliders-h"></i>`,
          view: () => ({ html: async () => await SettingsNexodev.instance({ idModal: 'modal-settings' }) }),
        },
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
          id: 'user-management',
          icon: html`<i class="fas fa-users-cog"></i>`,
          view: () => ({
            observer: true,
            html: async () => await UserManagement.instance({ appStore: AppStoreNexodev }),
          }),
        },
        {
          id: 'instance-management',
          icon: html`<i class="fas fa-layer-group"></i>`,
          view: () => ({
            observer: true,
            html: async () => InstanceManagement.instance({ appStore: AppStoreNexodev }),
          }),
        },
        {
          id: 'cron-management',
          icon: cronIcon,
          text: html`<div class="inl" style="top: -5px">${Translate.instance('cron-management')}</div>`,
          view: () => ({ observer: true, html: async () => CronManagement.instance({ appStore: AppStoreNexodev }) }),
        },
      ],
    };

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      mode: 'slide-menu',
      shell: { side: 'right' },
      RouterInstance,
      htmlMainBody: options.htmlMainBody,
    });
    ShellNavigation.bind(navigation);

    ThemeEvents['main-theme-handler'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/logo/nexodev-white-t.png`
        : `${getProxyPath()}assets/logo/nexodev-purple-t.png`;
      htmls(
        '.action-btn-app-icon-render',
        html`<img class="inl top-bar-app-icon" src="${srcLogo}" /> ${boxShadow({ selector: '.submenu-landing-card' })}`,
      );
      if (darkTheme) {
        const backgroundImage = `${getProxyPath()}assets/background/dark-purple.jpg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
            }
            .submenu-landing-card:hover {
              color: #d4d4d4;
              background-color: ${darkenHex(subThemeManager.darkColor, 0.75)};
            }
          `,
        );
      } else {
        const backgroundImage = `${getProxyPath()}assets/background/white-purple-2.jpg`;
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background-image: url('${backgroundImage}');
            }
            .submenu-landing-card:hover {
              color: ${subThemeManager.lightColor};
              background-color: ${lightenHex(subThemeManager.lightColor, 0.8)};
            }
          `,
        );
      }
    };

    setTimeout(ThemeEvents['main-theme-handler']);
  }
}

export { AppShellNexodev };
