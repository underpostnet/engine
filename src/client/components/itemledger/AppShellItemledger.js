import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';
import { RouterItemledger, BannerAppTemplate } from './RouterItemledger.js';
import { SettingsItemledger } from './SettingsItemledger.js';
import { Docs } from '../core/Docs.js';
import { deployPackageReleaseUrl } from '../core/Repository.js';
import { Recover } from '../core/Recover.js';
import { ItemLedgerManagement } from '../../services/item-ledger/item-ledger.management.js';
import { ObjectLayerEngineViewer } from '../objectlayer-studio/ObjectLayerEngineViewer.js';
import { MainBodyDocument } from '../core/MainBodyDocument.js';

class AppShellItemledger {
  static async instance() {
    const RouterInstance = RouterItemledger.instance();
    const user = () => AppStoreItemledger.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      iconSet: 'itemledger',
      entries: [
        { id: 'home', route: '', image: 'home.png', active: true },
        {
          id: 'item-ledger-registry',
          image: 'registry.png',
          view: () => ({
            observer: true,
            html: async () => ItemLedgerManagement.instance({ appStore: AppStoreItemledger }),
          }),
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
          view: () => ({ html: async () => await SettingsItemledger.instance({ idModal: 'modal-settings' }) }),
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
                ...Docs.uiIcons({ iconClass: 'itemledger-menu-icon' }),
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
      appStore: AppStoreItemledger,
      RouterInstance,
      readOnly: true,
      renderTitle: (text) => ShellNavigation.title(navigation, { image: 'object-layer.png', text }),
      openList: () => s('.main-btn-item-ledger-registry').click(),
    });

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/ui-icons/itemledger.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      htmlMainBody: async () => await MainBodyDocument.instance({ path: 'item-ledger/explanation/white-paper' }),
      searchCustomImgClass: 'itemledger-menu-icon',
    });
    ShellNavigation.bind(navigation);
  }
}

export { AppShellItemledger };
