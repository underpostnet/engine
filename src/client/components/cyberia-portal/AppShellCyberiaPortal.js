import { Account } from '../core/Account.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { Docs } from '../core/Docs.js';
import { deployPackageReleaseUrl } from '../core/Repository.js';
import { GoogleSignIn } from '../core/GoogleSignIn.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';
import { RouterCyberiaPortal, BannerAppTemplate } from './RouterCyberiaPortal.js';
import { SettingsCyberiaPortal } from './SettingsCyberiaPortal.js';
import { Chat } from '../core/Chat.js';
import { Recover } from '../core/Recover.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { ObjectLayerEngineViewer } from '../objectlayer-studio/ObjectLayerEngineViewer.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';
import { MainBodyCyberiaPortal } from './MainBodyCyberiaPortal.js';
import { MapEngineCyberia } from '../cyberia/MapEngineCyberia.js';
import { InstanceEngineCyberia } from '../cyberia/InstanceEngineCyberia.js';
import { InstanceSelectionView } from '../cyberia/InstanceSelectionView.js';
import { gameClientUrl } from '../cyberia/GameLaunchCyberia.js';
import { DEFAULT_INSTANCE_CODE } from '../cyberia/SharedDefaultsCyberia.js';
import { ActionEngineCyberia } from '../cyberia/ActionEngineCyberia.js';
import { EntityEngineCyberia } from '../cyberia/EntityEngineCyberia.js';
import { ProceduralEngineCyberia } from '../cyberia/ProceduralEngineCyberia.js';
import { ItemCatalogCyberia } from '../cyberia/ItemCatalogCyberia.js';
import { CyberiaObjectLayerProfile } from '../cyberia/ObjectLayerProfileCyberia.js';
import { CyberiaObjectLayerStudio } from '../cyberia/ObjectLayerStudioCyberia.js';
import { StudioCyberia } from '../cyberia/StudioCyberia.js';

class AppShellCyberiaPortal {
  static async instance() {
    const RouterInstance = RouterCyberiaPortal.instance();
    const appStore = AppStoreCyberiaPortal;
    const user = () => appStore.Data.user.main.model.user;
    const studioViews = {
      'object-layer-engine': () => ({
        html: async () =>
          await ObjectLayerEngineModal.instance({
            idModal: 'modal-object-layer-engine',
            appStore,
            profile: CyberiaObjectLayerProfile,
            studio: CyberiaObjectLayerStudio,
          }),
      }),
      'object-layer-engine-management': () => ({
        observer: true,
        html: async () =>
          ObjectLayerManagement.instance({
            appStore,
            profile: CyberiaObjectLayerProfile,
            columns: CyberiaObjectLayerStudio.columns(),
          }),
      }),
      'object-layer-engine-viewer': () => ({ observer: true, html: async () => ObjectLayerEngineViewer.instance() }),
      'cyberia-procedural-engine': () => ({
        observer: true,
        html: async () => await ProceduralEngineCyberia.render({ appStore }),
      }),
      'cyberia-map-engine': () => ({ observer: true, html: async () => await MapEngineCyberia.render({ appStore }) }),
      'cyberia-instance-engine': () => ({
        observer: true,
        html: async () => await InstanceEngineCyberia.render({ appStore }),
      }),
      'cyberia-action-engine': () => ({
        observer: true,
        html: async () => await ActionEngineCyberia.render({ appStore }),
      }),
      'cyberia-entity-engine': () => ({
        observer: true,
        html: async () => await EntityEngineCyberia.render({ appStore }),
      }),
      'cyberia-item-catalog': () => ({
        observer: true,
        html: async () => await ItemCatalogCyberia.render({ appStore }),
      }),
    };
    const navigation = {
      RouterInstance,
      iconSet: 'cyberia',
      entries: [
        { id: 'home', route: '', image: 'home.png', active: true },
        {
          id: 'instance-selection',
          image: 'map.png',
          view: () => ({ html: async () => await InstanceSelectionView.render({ appStore }) }),
        },
        {
          id: 'log-in',
          image: 'log-in.png',
          view: () => ({ html: async () => await LogIn.instance({ providerRender: GoogleSignIn.instance }) }),
        },
        {
          id: 'sign-up',
          image: 'sign-up.png',
          view: () => ({
            html: async () =>
              await SignUp.instance({ idModal: 'modal-sign-up', providerRender: GoogleSignIn.instance }),
          }),
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
          view: () => ({ html: async () => await SettingsCyberiaPortal.instance({ idModal: 'modal-settings' }) }),
        },
        {
          id: 'server',
          icon: html`<i class="fas fa-server"></i>`,
          hidden: true,
          view: () => ({ html: async () => '' }),
        },
        {
          id: 'chat',
          image: 'chat.png',
          view: () => ({ observer: true, html: async () => await Chat.instance({ idModal: 'modal-chat' }) }),
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
                ...Docs.uiIcons({ iconClass: 'cyberia-menu-icon' }),
                demoUrl: () => gameClientUrl(DEFAULT_INSTANCE_CODE),
                lastReleaseUrl: deployPackageReleaseUrl,
              }),
          }),
        },
        {
          id: 'recover',
          image: 'update.png',
          hidden: true,
          view: () => ({ html: async () => await Recover.instance({ idModal: 'modal-recover', user: user() }) }),
        },
        StudioCyberia.navigationEntry(studioViews),
      ],
    };
    ObjectLayerEngineViewer.configure({
      appStore,
      RouterInstance,
      profile: CyberiaObjectLayerProfile,
      studio: CyberiaObjectLayerStudio,
      columns: CyberiaObjectLayerStudio.columns,
      renderTitle: (text) => ShellNavigation.title(navigation, { image: 'object-layer.png', text }),
    });

    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      titleRender: () => '',
      htmlMainBody: async () => await MainBodyCyberiaPortal.instance(),
      mode: 'slide-menu',
      RouterInstance,
      searchCustomImgClass: 'cyberia-menu-icon',
    });
    ShellNavigation.bind(navigation);

    ThemeEvents['portal-main-theme-event'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/ui-icons/cyberia-white.png`
        : `${getProxyPath()}assets/ui-icons/cyberia-white.png`;

      htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);

      if (darkTheme) {
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background: #191919;
            }
          `,
        );
      } else {
        htmls(
          `.style-ssr-background-image`,
          css`
            .ssr-background-image {
              background: #e8e8e8;
            }
          `,
        );
      }
    };
    setTimeout(ThemeEvents['portal-main-theme-event']);
  }
}

export { AppShellCyberiaPortal };
