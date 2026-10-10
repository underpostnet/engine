import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreDogmadual } from './AppStoreDogmadual.js';
import { RouterDogmadual, BannerAppTemplate } from './RouterDogmadual.js';
import { SettingsDogmadual } from './SettingsDogmadual.js';
import { Recover } from '../core/Recover.js';

class AppShellDogmadual {
  static async instance(options = { htmlMainBody: () => html`` }) {
    const RouterInstance = RouterDogmadual.instance();
    const user = () => AppStoreDogmadual.Data.user.main.model.user;
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
          id: 'settings',
          icon: html`<i class="fas fa-sliders-h"></i>`,
          view: () => ({ html: async () => await SettingsDogmadual.instance({ idModal: 'modal-settings' }) }),
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
          const srcLogo = darkTheme
            ? `${getProxyPath()}assets/logo/dogmadual-white-t.png`
            : `${getProxyPath()}assets/logo/dogmadual-black-t.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      htmlMainBody: options.htmlMainBody,
    });
    ShellNavigation.bind(navigation);
  }
}

export { AppShellDogmadual };
