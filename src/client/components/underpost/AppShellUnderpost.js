import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { extractUsernameFromPath, getProxyPath, getQueryParams } from '../core/Router.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import Sortable from 'sortablejs';
import { RouterUnderpost, BannerAppTemplate } from './RouterUnderpost.js';
import { LabGalleryUnderpost } from './LabGalleryUnderpost.js';
import { CyberpunkBloggerUnderpost } from './CyberpunkBloggerUnderpost.js';
import { Badge } from '../core/Badge.js';
import { SettingsUnderpost } from './SettingsUnderpost.js';
import { Recover } from '../core/Recover.js';
import { PanelForm } from '../core/PanelForm.js';
import { SearchBox } from '../core/SearchBox.js';
import { DocumentSearchProvider } from './DocumentSearchProvider.js';
import { PublicProfile } from '../core/PublicProfile.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Content } from '../core/Content.js';

class AppShellUnderpost {
  static Data = {};
  static async instance() {
    const id = getId(AppShellUnderpost.Data, 'menu-');
    AppShellUnderpost.Data[id] = {};
    const RouterInstance = RouterUnderpost.instance();

    const { barConfig } = await Themes[Css.currentTheme]();

    await Modal.instance({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-contracultura-cyberpunk',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/blogger.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('contracultura-cyberpunk')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="contracultura-cyberpunk"`,
            tabHref: `${getProxyPath()}contracultura-cyberpunk`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('blog')),
          })}
          ${true
            ? ''
            : await BtnIcon.instance({
                class: 'in wfa main-btn-menu main-btn-lab-gallery hide',
                useMenuBtn: true,
                label: renderMenuLabel({
                  icon: html`<img
                    class="inl underpost-menu-icon"
                    src="${getProxyPath()}assets/ui-icons/gallery.png"
                  />`,
                  text: html`<span class="menu-label-text">${Translate.instance('lab-gallery')}</span>`,
                }),
                // style: 'display: none',
                attrs: `data-id="lab-gallery"`,
                tabHref: `${getProxyPath()}lab-gallery`,
                handleContainerClass: 'handle-btn-container',
                tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('blog')),
              })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/home.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="home"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-in',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-sign-up',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('sign-up')}</span>`,
            }),
            attrs: `data-id="sign-up"`,
            tabHref: `${getProxyPath()}sign-up`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('sign-up')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-log-out',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('log-out')}</span>`,
            }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('log-out')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-account',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/account.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('account')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="account"`,
            tabHref: `${getProxyPath()}account`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('account')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-public-profile',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/character.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('public-profile')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="public-profile"`,
            tabHref: `${getProxyPath()}u`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('public-profile')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-content hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/doc.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('content')}</span>`,
            }),
            attrs: `data-id="content"`,
            tabHref: `${getProxyPath()}content`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('content')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-cloud hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/cloud.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('cloud')}</span>`,
            }),
            attrs: `data-id="cloud"`,
            tabHref: `${getProxyPath()}cloud`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('cloud')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-settings',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-recover hide',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/update.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('recover')}</span>`,
            }),
            attrs: `data-id="recover"`,
            tabHref: `${getProxyPath()}recover`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('recover')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-polyhedron',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/polyhedron.png" />`,
              text: html`<span class="menu-label-text">Polyhedron</span>`,
            }),
            attrs: `data-id="polyhedron"`,
            tabHref: `${getProxyPath()}polyhedron`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('polyhedron')),
          })}
          ${await BtnIcon.instance({
            class: 'in wfa main-btn-menu main-btn-github',
            useMenuBtn: true,
            label: renderMenuLabel({
              icon: html`<img class="inl underpost-menu-icon" src="${getProxyPath()}assets/ui-icons/github.png" />`,
              text: html`<span class="menu-label-text">${Translate.instance('github')}</span>`,
            }),
            attrs: `data-id="github"`,
            tabHref: `https://github.com/underpostnet/`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption('github')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      titleRender: () => {
        return '';
      },
      mode: 'slide-menu',
      RouterInstance,
      searchCustomImgClass: 'underpost-menu-icon',
      htmlMainBody: async () => {
        // Create PanelForm instance first to get update function
        const panelFormInstance = await PanelForm.instance({
          idPanel: 'underpost-panel',
          defaultUrlImage: `${getProxyPath()}assets/splash/apple-touch-icon-precomposed.png`,
          appStore: AppStoreUnderpost,
          route: 'home',
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
          onClick: (result, context) => {
            DocumentSearchProvider.onClick(result, {
              ...context,
              RouterInstance,
              currentRoute: 'home',
              updatePanel: PanelForm.Data['underpost-panel'].updatePanel,
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

    ThemeEvents['underpost-main-theme-event'] = () => {
      const srcLogo = darkTheme
        ? `${getProxyPath()}assets/ui-icons/underpost.png`
        : `${getProxyPath()}assets/ui-icons/underpost.png`;

      if (s('.action-btn-app-icon-render'))
        htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);

      if (s(`.style-ssr-background-image`)) {
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
      }
    };
    setTimeout(ThemeEvents['underpost-main-theme-event']);

    AppShellUnderpost.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
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
      await Modal.instance({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/sign-up.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('sign-up')}</span>`,
        }),
        html: async () => await SignUp.instance({ idModal: 'modal-sign-up' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-out.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('log-out')}</span>`,
        }),
        html: async () => await LogOut.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/log-in.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('log-in')}</span>`,
        }),
        html: async () => await LogIn.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-lab-gallery`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-lab-gallery',
        route: 'lab-gallery',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/gallery.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('lab-gallery')}</span>`,
        }),
        html: async () => await LabGalleryUnderpost.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-contracultura-cyberpunk`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-contracultura-cyberpunk',
        route: 'contracultura-cyberpunk',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/blogger.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('contracultura-cyberpunk')}</span>`,
        }),
        html: async () => await CyberpunkBloggerUnderpost.instance(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/account.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('account')}</span>`,
        }),
        html: async () =>
          await Account.instance({
            idModal: 'modal-account',
            user: AppStoreUnderpost.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    PublicProfile.Router();

    EventsUI.onClick(`.main-btn-public-profile`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      const idModal = 'modal-public-profile';
      const loggedInUser = AppStoreUnderpost.Data.user.main.model.user;

      // Determine the target username: prefer URL path/query over logged-in user
      const usernameFromPath = extractUsernameFromPath();
      const queryParams = getQueryParams();
      const targetUsername = usernameFromPath || queryParams.cid || loggedInUser.username || null;

      // Create user object with the target username for rendering
      const targetUser = targetUsername ? { username: targetUsername } : loggedInUser;

      // Check if modal already exists
      const existingModal = s(`.${idModal}`);
      if (existingModal) {
        if (targetUsername) {
          await PublicProfile.Update({
            idModal: 'modal-public-profile',
            user: { username: targetUsername },
          });
          return;
        }
      }

      await Modal.instance({
        id: idModal,
        route: 'u',
        barConfig,
        title: '',
        //   renderViewTitle({
        //   icon: html`<i class="fas fa-user-circle"></i>`,
        //   text: Translate.instance('public-profile'),
        // }),
        html: async () =>
          await PublicProfile.instance({
            idModal,
            user: targetUser,
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
      await Modal.instance({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/settings.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('settings')}</span>`,
        }),
        html: async () => await SettingsUnderpost.instance({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-content`, async () => {
      let subModalId = '';
      const path =
        location.pathname[location.pathname.length - 1] === '/' ? location.pathname.slice(0, -1) : location.pathname;

      if (path.split('/').pop() === 'content' && getQueryParams().cid) {
        subModalId = `-${getQueryParams().cid}`;
      }

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: `modal-content${subModalId}`,
        route: 'content',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/doc.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('content')}</span>`,
        }),
        html: async () =>
          await Content.instance({
            idModal: `modal-content${subModalId}`,
            titleIcon: html`<img
              class="inl underpost-menu-icon-modal"
              src="${getProxyPath()}assets/ui-icons/doc.png"
            />`,
          }),
        query: true,
        observer: true,
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-cloud`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-cloud',
        route: 'cloud',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/cloud.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('cloud')}</span>`,
        }),
        html: async () => await FileExplorer.instance({ idModal: 'modal-cloud' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({
          icon: html`<img class="inl underpost-menu-icon-modal" src="${getProxyPath()}assets/ui-icons/update.png" />`,
          text: `<span class='inl underpost-text-title-modal'>${Translate.instance('recover')}</span>`,
        }),
        html: async () =>
          await Recover.instance({ idModal: 'modal-recover', user: AppStoreUnderpost.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-polyhedron`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.instance({
        id: 'modal-polyhedron',
        route: 'polyhedron',
        barConfig,
        title: renderViewTitle({
          icon: html`<img
            class="inl underpost-menu-icon-modal"
            src="${getProxyPath()}assets/ui-icons/polyhedron.png"
          />`,
          text: `<span class='inl underpost-text-title-modal'>Polyhedron</span>`,
        }),
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
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-github`, async () => {
      location.href = `https://github.com/underpostnet/pwa-microservices-template/`;
    });
  }
}

export { AppShellUnderpost };
