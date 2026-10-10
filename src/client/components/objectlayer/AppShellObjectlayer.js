import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreObjectlayer } from './AppStoreObjectlayer.js';
import { RouterObjectlayer, BannerAppTemplate } from './RouterObjectlayer.js';
import { SettingsObjectlayer } from './SettingsObjectlayer.js';
import { Docs } from '../core/Docs.js';
import { deployPackageReleaseUrl } from '../core/Repository.js';
import { Recover } from '../core/Recover.js';
import { ObjectLayerEngineViewer } from '../objectlayer-studio/ObjectLayerEngineViewer.js';
import { MainBodyDocument } from '../core/MainBodyDocument.js';

class AppShellObjectlayer {
  static async instance() {
    const RouterInstance = RouterObjectlayer.instance();
    const user = () => AppStoreObjectlayer.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      iconSet: 'objectlayer',
      entries: [
        { id: 'home', route: '', image: 'home.png', active: true },
        {
          id: 'object-layer-engine-viewer',
          image: 'object-layer.png',
          view: () => ({ observer: true, html: async () => ObjectLayerEngineViewer.instance() }),
        },
        { id: 'log-in', image: 'log-in.png', view: () => ({ html: async () => await LogIn.instance() }) },
        {
          id: 'sign-up',
          image: 'sign-up.png',
          view: () => ({ html: async () => await SignUp.instance({ idModal: 'modal-sign-up' }) }),
        },
        {
          id: 'log-out',
          image: 'log-out.png',
          session: true,
          view: () => ({ html: async () => await LogOut.instance() }),
        },
        {
          id: 'account',
          image: 'account.png',
          session: true,
          view: () => ({
            html: async () => await Account.instance({ idModal: 'modal-account', user: user(), disabled: [] }),
          }),
        },
        {
          id: 'settings',
          image: 'settings.png',
          view: () => ({ html: async () => await SettingsObjectlayer.instance({ idModal: 'modal-settings' }) }),
        },
        {
          id: 'docs',
          image: 'wiki.png',
          submenu: true,
          view: () => ({
            observer: true,
            html: async () =>
              await Docs.instance({
                idModal: 'modal-docs',
                ...Docs.uiIcons({ iconClass: 'objectlayer-menu-icon' }),
                disabled: ['demo'],
                lastReleaseUrl: deployPackageReleaseUrl,
              }),
          }),
        },
        {
          id: 'recover',
          icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
          hidden: true,
          view: () => ({ html: async () => await Recover.instance({ idModal: 'modal-recover', user: user() }) }),
        },
      ],
    };
    ObjectLayerEngineViewer.configure({
      appStore: AppStoreObjectlayer,
      RouterInstance,
      readOnly: true,
      lifecycle: true,
      renderTitle: (text) => ShellNavigation.title(navigation, { image: 'object-layer.png', text }),
    });

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/ui-icons/object-layer.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      htmlMainBody: async () => await MainBodyDocument.instance({ path: 'object-layer/explanation/white-paper' }),
      searchCustomImgClass: 'objectlayer-menu-icon',
    });
    ShellNavigation.bind(navigation);
  }
}

export { AppShellObjectlayer };
