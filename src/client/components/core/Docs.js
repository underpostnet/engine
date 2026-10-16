import { Css, darkTheme, simpleIconsRender, ThemeEvents, Themes } from './Css.js';
import { buildManifest } from './BuildManifest.js';
import { Modal, SUBMENU_SELECTION_QUERY_KEY, renderViewTitle } from './Modal.js';
import { coverallsUrl, githubPagesUrl, packageRepository, releaseUrl } from './Repository.js';
import { Responsive } from './Responsive.js';
import { ShellLayout } from './ShellLayout.js';
import {
  listenQueryPathInstance,
  setQueryPath,
  closeModalRouteChangeEvent,
  getProxyPath,
  getQueryParams,
} from './Router.js';
import { s } from './VanillaJs.js';
// https://mintlify.com/docs/quickstart
class Docs {
  static async RenderModal(type, parentModalId = 'modal-docs') {
    const docData = Docs.Data.find((d) => d.type === type);
    const parentModal = Modal.Data[parentModalId];
    if (!docData || !parentModal?.options) return;
    const ModalId = `modal-docs-${docData.type}`;
    const { barConfig } = await Themes[Css.currentTheme]();
    // A shell that draws from an icon set titles the view with it; the rest with the entry's icon.
    const { viewTitle } = Docs.Tokens[parentModalId] ?? {};
    await Modal.instance({
      barConfig,
      title: viewTitle ? viewTitle(docData) : renderViewTitle(docData),
      id: ModalId,
      html: async () => {
        if (docData.renderHtml) return await docData.renderHtml(Docs.Tokens[parentModalId] ?? {});
        return html`
          <style>
            .iframe-${ModalId} {
              width: 100%;
              border: none;
              background: white;
              display: block;
              /* The frame is the only scroll container; the modal body must not
                 gain one of its own from the height set on load. */
              overflow: auto;
            }
          </style>
          <iframe class="in iframe-${ModalId}" src="${docData.url()}"> </iframe>
        `;
      },
      maximize: true,
      mode: 'view',
      route: 'docs',
      slideMenu: 'modal-menu',
      observer: true,
      query: true,
      RouterInstance: parentModal.options.RouterInstance,
    });
    const iframeEl = s(`.iframe-${ModalId}`);
    let themeEventKey = null;
    let themeObserver = null;
    let unbindIframeLayoutSync = null;
    if (iframeEl) {
      const scheduleViewLayoutSync = () => {
        const sync = () => ShellLayout.sync();
        sync();
        setTimeout(sync, 0);
        setTimeout(sync, 120);
        setTimeout(sync, 400);
      };
      iframeEl.addEventListener('load', () => {
        try {
          const iframeWin = iframeEl.contentWindow;
          if (iframeWin) {
            Object.defineProperty(iframeWin, 'parent', { get: () => iframeWin, configurable: false });
            Object.defineProperty(iframeWin, 'top', { get: () => iframeWin, configurable: false });
          }
        } catch (e) {
          // cross-origin or security restriction — safe to ignore
        }
        // These modals are fixed-position; scrolling the parent on iframe
        // navigation shifts Chrome layout calculations and leaves view modals
        // offset by 50px, so deep links re-sync the layout instead.
        try {
          const iframeWin = iframeEl.contentWindow;
          const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
          if (iframeDoc) {
            // The frame re-runs this on every in-frame navigation; without
            // releasing the previous document's listeners they accumulate for
            // the lifetime of the modal.
            if (unbindIframeLayoutSync) unbindIframeLayoutSync();
            const onIframeAnchorClick = (e) => {
              if (e.target?.closest?.('a')) scheduleViewLayoutSync();
            };
            const onIframeHashChange = () => scheduleViewLayoutSync();
            const onIframePopState = () => scheduleViewLayoutSync();
            // Mirrors the app-wide shortcut: the frame owns focus, so the parent
            // never sees the keystroke unless the frame forwards it.
            const onIframeSearchShortcut = (e) => {
              if (!e.shiftKey || e.key?.toLowerCase() !== 'k') return;
              e.preventDefault();
              e.stopPropagation();
              ShellLayout.focusSearch();
            };
            iframeDoc.addEventListener('click', onIframeAnchorClick, true);
            iframeDoc.addEventListener('keydown', onIframeSearchShortcut);
            if (iframeWin) {
              iframeWin.addEventListener('hashchange', onIframeHashChange);
              iframeWin.addEventListener('popstate', onIframePopState);
            }
            unbindIframeLayoutSync = () => {
              iframeDoc.removeEventListener('click', onIframeAnchorClick, true);
              iframeDoc.removeEventListener('keydown', onIframeSearchShortcut);
              if (iframeWin) {
                iframeWin.removeEventListener('hashchange', onIframeHashChange);
                iframeWin.removeEventListener('popstate', onIframePopState);
              }
            };
          }
        } catch (e) {
          // cross-origin or security restriction — safe to ignore
        }
        scheduleViewLayoutSync();
      });
      if (type === 'src' || type === 'api') {
        themeEventKey = `docs-iframe-${ModalId}`;
        const applyDocsTheme = () => {
          try {
            const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
            if (!iframeDoc?.documentElement) return false;
            if (type === 'api') {
              const toggle = iframeDoc.querySelector('.dark-mode-toggle button');
              if (!toggle) return false;
              if (iframeDoc.documentElement.classList.contains('dark-mode') !== darkTheme) toggle.click();
            } else {
              iframeDoc.documentElement.setAttribute('data-theme', darkTheme ? 'dark' : 'light');
              iframeEl.contentWindow?.localStorage?.setItem('tsd-theme', darkTheme ? 'dark' : 'light');
            }
            return true;
          } catch (e) {
            return false;
          }
        };
        const syncDocsTheme = () => {
          if (applyDocsTheme()) {
            themeObserver?.disconnect();
            themeObserver = null;
          }
        };
        iframeEl.addEventListener('load', () => {
          themeObserver?.disconnect();
          themeObserver = null;
          if (applyDocsTheme() || type !== 'api') return;
          try {
            const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
            if (!iframeDoc) return;
            themeObserver = new MutationObserver(syncDocsTheme);
            themeObserver.observe(iframeDoc, { childList: true, subtree: true });
          } catch (e) {}
        });
        ThemeEvents[themeEventKey] = () => {
          if (s(`.iframe-${ModalId}`)) syncDocsTheme();
        };
      }
    }
    // The iframe is sized to the modal body rather than left to grow: an
    // auto-height iframe inside a fixed-height modal scrolls the modal and the
    // document it holds, which is where the double scrollbar comes from.
    const resizeIframe = () => {
      const frame = s(`.iframe-${ModalId}`);
      const modalEl = s(`.${ModalId}`);
      if (!frame || !modalEl) return;
      const barEl = s(`.bar-default-modal-${ModalId}`);
      const barHeight = barEl ? barEl.offsetHeight : Modal.headerTitleHeight;
      frame.style.height = `${Math.max(modalEl.offsetHeight - barHeight, 0)}px`;
    };

    Modal.Data[ModalId].onObserverListener[ModalId] = () => {
      resizeIframe();
      if (type.match('coverage')) simpleIconsRender(`.doc-icon-coverage`);
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
    // The observer fires on modal mutations, not on viewport changes; a rotate
    // or a window drag leaves the frame at its old height without this.
    Responsive.onChanged(resizeIframe, { key: ModalId });
    Modal.Data[ModalId].onCloseListener[ModalId] = () => {
      Responsive.offChanged(ModalId);
      if (unbindIframeLayoutSync) unbindIframeLayoutSync();
      themeObserver?.disconnect();
      if (themeEventKey) delete ThemeEvents[themeEventKey];
      closeModalRouteChangeEvent({ closedId: ModalId });
    };
  }
  // One entry per coverage report the build declared, each framed from /docs/coverage/<id>.
  static coverageReports = () =>
    buildManifest().documentation.coverage.map(({ id, label }) => ({
      type: `coverage-${id}`,
      icon: html`<img height="20" width="20" class="doc-icon-coverage" />`,
      text: label,
      url: () => `${getProxyPath()}docs/coverage/${id}`,
    }));
  /** The entries the shell deploys: every type it did not disable. */
  static get Data() {
    const disabled = Docs.Tokens['modal-docs']?.disabled ?? [];
    return Docs.entries.filter(({ type }) => !disabled.includes(type));
  }
  static get entries() {
    return [
      {
        type: 'guide',
        icon: html`<i class="fa-solid fa-file-circle-question"></i>`,
        text: 'Documentation',
        url: function () {
          return `${getProxyPath()}docs`;
        },
        // The build names the domains the view navigates; their documents are the only ones listed.
        renderHtml: async () => {
          const { Documentation } = await import('./Documentation.js');
          return await Documentation.instance({ path: getQueryParams().doc ?? '' });
        },
      },
      {
        type: 'repo',
        external: true,
        icon: html`<i class="fab fa-github"></i>`,
        text: `Last Release`,
        url: function () {
          const tokenOpts = Docs.Tokens['modal-docs'];
          if (tokenOpts && tokenOpts.lastReleaseUrl) return tokenOpts.lastReleaseUrl();
          return releaseUrl();
        },
      },
      {
        type: 'demo',
        external: true,
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32">
          <path fill="currentColor" d="M20 2v12l10-6z" />
          <path
            fill="currentColor"
            d="M28 14v8H4V6h10V4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8v4H8v2h16v-2h-4v-4h8a2 2 0 0 0 2-2v-8zM18 28h-4v-4h4z"
          />
        </svg>`,
        text: html`Demo`,
        url: function () {
          const tokenOpts = Docs.Tokens['modal-docs'];
          if (tokenOpts && tokenOpts.demoUrl) return tokenOpts.demoUrl();
          return githubPagesUrl(packageRepository());
        },
      },
      {
        type: 'src',
        icon: html`<i class="fa-brands fa-osi"></i>`,
        text: 'Source Docs',
        url: function () {
          return `${getProxyPath()}docs/engine/${buildManifest().version.replace('v', '')}`;
        },
      },
      {
        type: 'api',
        icon: html`<i class="fa-solid fa-arrows-turn-to-dots"></i>`,
        text: `Api Docs`,
        url: function () {
          return `${getProxyPath()}api-docs`;
        },
      },
      ...Docs.coverageReports(),
      {
        type: 'coverage-link',
        external: true,
        icon: html`<img height="20" width="20" class="doc-icon-coverage" />`,
        text: `Coverage`,
        url: function () {
          const tokenOpts = Docs.Tokens['modal-docs'];
          if (tokenOpts && tokenOpts.coverageLinkUrl) return tokenOpts.coverageLinkUrl();
          return coverallsUrl();
        },
      },
    ];
  }
  static Tokens = {};
  /** What each entry's landing card says under its title. A coverage report names its run. */
  static CARD_DESCRIPTIONS = {
    guide: 'Overview, explanations, how-to guides and reference of this domain',
    repo: 'The latest published release and its changelog',
    demo: 'The live application, running the latest release',
    src: 'Reference generated from the source, with the design documents',
    api: 'The REST API reference: every endpoint, request and response',
    'coverage-link': 'Test coverage history on Coveralls',
  };
  static cardDescription = ({ type, text }) => Docs.CARD_DESCRIPTIONS[type] ?? `Test coverage report: ${text}`;
  /**
   * The `assets/ui-icons` image each entry type is drawn with, for a shell that draws its menu
   * from that set: the closest match the set holds. A coverage report reads as a check.
   */
  static UI_ICONS = {
    guide: 'dude',
    repo: 'github',
    demo: 'forward',
    src: 'doc',
    api: 'reload',
    'coverage-link': 'star',
  };
  /**
   * Draws the entries from the `assets/ui-icons` set with the classes a shell draws its own
   * entries with: the menu icon class in the submenu and on the landing cards, and the shell's
   * `-modal` icon and title-text classes in a document view's title.
   * @param {object} options
   * @param {string} options.iconClass - The shell's menu icon class, e.g. `cyberia-menu-icon`.
   * @param {string} [options.modalIconClass] - The view title icon class; `<iconClass>-modal` by convention.
   * @param {string} [options.modalTextClass] - The view title text class; `<prefix>-text-title-modal` by convention.
   * @returns {{subMenuIcon: (type: string) => string, viewTitle: (docData: object) => string}} `Docs.instance` options.
   */
  static uiIcons = ({
    iconClass,
    modalIconClass = `${iconClass}-modal`,
    modalTextClass = `${iconClass.replace(/-menu-icon$/, '')}-text-title-modal`,
  }) => {
    const src = (type) =>
      `${getProxyPath()}assets/ui-icons/${Docs.UI_ICONS[type] ?? (type.startsWith('coverage-') ? 'check' : 'doc')}.png`;
    return {
      subMenuIcon: (type) => html`<img class="inl ${iconClass}" src="${src(type)}" />`,
      viewTitle: ({ type, text }) =>
        renderViewTitle({
          icon: html`<img class="inl ${modalIconClass}" src="${src(type)}" />`,
          text: html`<span class="inl ${modalTextClass}">${text}</span>`,
        }),
    };
  };
  /**
   * The docs landing and submenu of one shell.
   * @param {object} options
   * @param {string} options.idModal - Id of the modal the landing renders in.
   * @param {string[]} [options.disabled] - Entry types this shell does not deploy.
   */
  static async instance(options = {}) {
    const { idModal } = options;
    Docs.Tokens[idModal] = options;
    // An external entry leaves the app; the rest open in a framed modal on their own route. The
    // framed section is view state of `/docs` (the documents have static URLs of their own), kept
    // under the submenu key: `/docs?cid=src` is a published deep link.
    const openDoc = async (docData) => {
      if (docData.external) return (location.href = docData.url());
      ShellLayout.closeDrawer();
      // A deep link that already selects this entry keeps the rest of its state: `doc`, an anchor.
      if (getQueryParams()[SUBMENU_SELECTION_QUERY_KEY] !== docData.type)
        setQueryPath({ path: 'docs', queryPath: docData.type }, SUBMENU_SELECTION_QUERY_KEY);
      await Docs.RenderModal(docData.type, idModal);
    };
    setTimeout(() => {
      for (const docData of Docs.Data) {
        const btnEl = s(`.btn-docs-${docData.type}`);
        // A shell can own the docs view without owning a docs submenu; then the landing cards
        // are the only entry points.
        if (!btnEl) continue;
        btnEl.onclick = () => openDoc(docData);
      }
      listenQueryPathInstance(
        {
          id: options.idModal,
          routeId: 'docs',
          event: (path) => {
            if (s(`.btn-docs-${path}`)) s(`.btn-docs-${path}`).click();
          },
        },
        SUBMENU_SELECTION_QUERY_KEY,
      );
    });
    // The coverage icons are tinted to the theme's text colour, so they follow theme changes.
    ThemeEvents['doc-icon-coverage'] = () => {
      if (s(`.doc-icon-coverage`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage`));
    };
    setTimeout(ThemeEvents['doc-icon-coverage']);
    // Build submenu items and populate — submenu system is owned by Modal
    Modal.subMenuPopulate('docs', await Modal.buildSubMenuItemsHtml('docs', Docs.Data, options));

    // One card per deployed entry: the landing and the submenu offer the same places, drawn with
    // the same icon when the shell draws from an image set.
    return Modal.renderSubMenuLanding({
      subMenuId: 'docs',
      title: 'Documentation',
      cards: Docs.Data.map((docData) => ({
        id: docData.type,
        icon: options.subMenuIcon ? options.subMenuIcon(docData.type) : docData.icon,
        title: docData.text,
        description: Docs.cardDescription(docData),
        open: () => openDoc(docData),
      })),
    });
  }
}
export { Docs };
