import { Account } from '../core/Account.js';
import { commonAdminGuard, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { ShellNavigation } from '../core/ShellNavigation.js';
import { SignUp } from '../core/SignUp.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath, getPublicRouteParam } from '../core/Router.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import { RouterUnderpost, BannerAppTemplate } from './RouterUnderpost.js';
import { CyberpunkBloggerUnderpost } from './CyberpunkBloggerUnderpost.js';
import { Docs } from '../core/Docs.js';
import { organizationUrl } from '../core/Repository.js';
import { SettingsUnderpost } from './SettingsUnderpost.js';
import { Recover } from '../core/Recover.js';
import { PanelForm } from '../core/PanelForm.js';
import { SearchBox } from '../core/SearchBox.js';
import { DocumentSearchProvider } from './DocumentSearchProvider.js';
import { PublicProfile } from '../core/PublicProfile.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Content } from '../core/Content.js';
import { UserManagement } from '../../services/user/user.management.js';

class AppShellUnderpost {
  static async instance() {
    const RouterInstance = RouterUnderpost.instance();
    const githubUrl = organizationUrl();
    const user = () => AppStoreUnderpost.Data.user.main.model.user;
    const navigation = {
      RouterInstance,
      iconSet: 'underpost',
      entries: [
        {
          id: 'contracultura-cyberpunk',
          image: 'blogger.png',
          view: () => ({ html: async () => await CyberpunkBloggerUnderpost.instance() }),
        },
        { id: 'home', route: '', image: 'home.png', active: true, hidden: true },
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
          id: 'public-profile',
          route: 'u',
          image: 'character.png',
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
          id: 'content',
          image: 'doc.png',
          hidden: true,
          view: () => {
            const stableSlug = getPublicRouteParam('content');
            const idModal = `modal-content${stableSlug ? `-${stableSlug}` : ''}`;
            return {
              id: idModal,
              observer: true,
              html: async () =>
                await Content.instance({
                  idModal,
                  stableSlug,
                  titleIcon: html`<img
                    class="inl underpost-menu-icon-modal"
                    src="${getProxyPath()}assets/ui-icons/doc.png"
                  />`,
                }),
            };
          },
        },
        {
          id: 'cloud',
          image: 'cloud.png',
          hidden: true,
          view: () => ({ html: async () => await FileExplorer.instance({ idModal: 'modal-cloud' }) }),
        },
        {
          // Admins only: shown by the log-in handler for an admin session, hidden again on log-out.
          id: 'user-management',
          image: 'users.png',
          hidden: true,
          // The route reaches here for anyone; only an admin session opens the view, the rest go home.
          action: async (e, open) =>
            commonAdminGuard(user()?.role)
              ? await open({
                  observer: true,
                  html: async () => await UserManagement.instance({ appStore: AppStoreUnderpost }),
                })
              : await Modal.onHomeRouterEvent(),
        },
        {
          id: 'settings',
          image: 'settings.png',
          view: () => ({ html: async () => await SettingsUnderpost.instance({ idModal: 'modal-settings' }) }),
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
                ...Docs.uiIcons({ iconClass: 'underpost-menu-icon' }),
              }),
          }),
        },
        {
          id: 'recover',
          image: 'update.png',
          hidden: true,
          view: () => ({ html: async () => await Recover.instance({ idModal: 'modal-recover', user: user() }) }),
        },
        {
          id: 'polyhedron',
          image: 'polyhedron.png',
          text: 'Polyhedron',
          view: () => ({
            html: async () =>
              await Polyhedron.instance({
                idModal: 'modal-polyhedron',
                style: {
                  scene: { background: '#111' },
                  face: {
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.18)',
                    color: '#fff',
                  },
                },
              }),
          }),
        },
        { id: 'github', image: 'github.png', href: githubUrl, action: () => (location.href = githubUrl) },
      ],
    };

    const { barConfig } = await Themes[Css.currentTheme]();

    await Modal.instance({
      id: 'modal-menu',
      html: await ShellNavigation.render(navigation),
      shell: { layout: 'split', side: 'right' },
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      titleRender: () => '',
      mode: 'slide-menu',
      RouterInstance,
      searchCustomImgClass: 'underpost-menu-icon',
      htmlMainBody: async () => {
        // Create PanelForm instance first to get update function
        const panelFormInstance = await PanelForm.instance({
          idPanel: 'underpost-panel',
          defaultUrlImage: `${getProxyPath()}apple-touch-icon-precomposed.png`,
          appStore: AppStoreUnderpost,
          route: 'home',
          entryHost: true,
          share: {
            copyLink: true,
            copySourceMd: true,
          },
          showCreatorProfile: true,
        });

        // Register document search provider with SPA navigation and panel context
        SearchBox.registerProvider({
          ...DocumentSearchProvider,
          search: async (query, context) => {
            // Add idPanel to context to filter documents by panel tag
            return DocumentSearchProvider.search(query, {
              ...context,
              idPanel: 'underpost-panel', // Filter documents by panel tag
            });
          },
        });

        // Inject and update document search styles with theme support
        const updateDocumentSearchStyles = () => {
          const styleId = 'document-search-provider-styles';
          let styleTag = s(`#${styleId}`);

          if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
          }

          styleTag.textContent = DocumentSearchProvider.getStyles();
        };

        // Update SearchBox base styles
        const updateSearchBoxBaseStyles = () => {
          const baseStyleId = 'search-box-base-styles';
          let baseStyleTag = s(`#${baseStyleId}`);

          if (!baseStyleTag) {
            baseStyleTag = document.createElement('style');
            baseStyleTag.id = baseStyleId;
            document.head.appendChild(baseStyleTag);
          }

          baseStyleTag.textContent = SearchBox.getBaseStyles();
        };

        // Initial style injection
        updateDocumentSearchStyles();
        updateSearchBoxBaseStyles();

        // Register theme change handlers for dynamic styling
        ThemeEvents['documentSearchStyles'] = () => {
          updateDocumentSearchStyles();
          updateSearchBoxBaseStyles();
        };

        return panelFormInstance;
      },
    });
    ShellNavigation.bind(navigation);

    ThemeEvents['underpost-main-theme-event'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/ui-icons/underpost.png`
        : `${getProxyPath()}assets/ui-icons/underpost.png`;

      if (s('.action-btn-app-icon-render'))
        htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
    };
    setTimeout(ThemeEvents['underpost-main-theme-event']);
  }
}

export { AppShellUnderpost };
