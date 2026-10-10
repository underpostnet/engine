import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { MainBodyDocument } from '../core/MainBodyDocument.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreCryptokoyn } from './AppStoreCryptokoyn.js';
import { RouterCryptokoyn, BannerAppTemplate } from './RouterCryptokoyn.js';
import { WalletView } from '../wallet/WalletView.js';
import { SettingsCryptokoyn } from './SettingsCryptokoyn.js';
import { Recover } from '../core/Recover.js';
import { Docs } from '../core/Docs.js';
import { deployPackageReleaseUrl } from '../core/Repository.js';

class AppShellCryptokoyn {
  static async instance() {
    const RouterInstance = RouterCryptokoyn.instance();
    const user = () => AppStoreCryptokoyn.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      iconSet: 'cryptokoyn',
      entries: [
        { id: 'home', route: '', image: 'home.png', active: true },
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
          id: 'wallet',
          image: 'wallet.png',
          view: () => ({ html: async () => await WalletView.instance({ idModal: 'modal-wallet' }) }),
        },
        {
          id: 'settings',
          image: 'settings.png',
          view: () => ({ html: async () => await SettingsCryptokoyn.instance({ idModal: 'modal-settings' }) }),
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
                ...Docs.uiIcons({ iconClass: 'cryptokoyn-menu-icon' }),
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

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/ui-icons/cryptokoyn.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      htmlMainBody: async () => await MainBodyDocument.instance({ path: 'cryptokoyn/explanation/white-paper' }),
      searchCustomImgClass: 'cryptokoyn-menu-icon',
    });
    ShellNavigation.bind(navigation);
  }
}

export { AppShellCryptokoyn };
