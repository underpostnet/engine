import { Css, darkTheme, simpleIconsRender, ThemeEvents, Themes } from './Css.js';
import { Modal, renderViewTitle } from './Modal.js';
import { coverallsUrl, githubPagesUrl, githubUrl, packageRepository } from './Repository.js';
import { Responsive } from './Responsive.js';
import { listenQueryPathInstance, setQueryPath, closeModalRouteChangeEvent, getProxyPath } from './Router.js';
import { s, sIframe } from './VanillaJs.js';
// https://mintlify.com/docs/quickstart
class Docs {
  static async RenderModal(type, parentModalId = 'modal-docs') {
    const docData = Docs.Data.find((d) => d.type === type);
    const parentModal = Modal.Data[parentModalId];
    if (!docData || !parentModal?.options) return;
    const ModalId = `modal-docs-${docData.type}`;
    const { barConfig } = await Themes[Css.currentTheme]();
    const parentBarMode = parentModal.options.barMode;
    await Modal.instance({
      barConfig,
      title: renderViewTitle(docData),
      id: ModalId,
      html: async () => {
        if (docData.renderHtml) return await docData.renderHtml();
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
      barMode: parentBarMode,
      query: true,
      RouterInstance: parentModal.options.RouterInstance,
    });
    const iframeEl = s(`.iframe-${ModalId}`);
    let swaggerThemeEventKey = null;
    let unbindIframeLayoutSync = null;
    if (iframeEl) {
      const scheduleViewLayoutSync = () => {
        const sync = () => Modal.syncViewLayout();
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
              const searchBox = s(`.top-bar-search-box`);
              if (!searchBox) return;
              e.preventDefault();
              e.stopPropagation();
              if (s(`.main-body-btn-ui-close`)?.classList.contains('hide')) s(`.main-body-btn-ui-open`).click();
              searchBox.blur();
              searchBox.focus();
              searchBox.select();
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
      if (type === 'src') {
        swaggerThemeEventKey = `jsdocs-iframe-${ModalId}`;
        const applyJsDocsTheme = (isDark) => {
          try {
            const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
            if (!iframeDoc || !iframeDoc.documentElement) return;
            // TypeDoc built-in theme: data-theme on <html>, stored as 'tsd-theme' in localStorage
            iframeDoc.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            iframeEl.contentWindow?.localStorage?.setItem('tsd-theme', isDark ? 'dark' : 'light');
          } catch (e) {
            // cross-origin or security restriction — safe to ignore
          }
        };
        // Apply current theme as soon as the iframe content is ready
        iframeEl.addEventListener('load', () => applyJsDocsTheme(darkTheme));
        // Keep in sync whenever the parent page theme changes
        ThemeEvents[swaggerThemeEventKey] = () => {
          if (s(`.iframe-${ModalId}`)) applyJsDocsTheme(darkTheme);
        };
      }
      if (type === 'api') {
        swaggerThemeEventKey = `swagger-iframe-${ModalId}`;
        const applySwaggerTheme = (isDark) => {
          try {
            const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
            if (!iframeDoc || !iframeDoc.body) return;
            if (isDark) {
              iframeDoc.body.classList.add('swagger-dark');
            } else {
              iframeDoc.body.classList.remove('swagger-dark');
            }
            iframeEl.contentWindow?.localStorage?.setItem('swagger-theme', isDark ? 'dark' : 'light');
            const toggleBtn = sIframe(iframeEl, '#swagger-theme-toggle');
            if (toggleBtn) toggleBtn.textContent = isDark ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode';
          } catch (e) {
            // cross-origin or security restriction — safe to ignore
          }
        };
        // Apply current theme as soon as the iframe content is ready
        iframeEl.addEventListener('load', () => applySwaggerTheme(darkTheme));
        // Keep in sync whenever the parent page theme changes
        ThemeEvents[swaggerThemeEventKey] = () => {
          if (s(`.iframe-${ModalId}`)) applySwaggerTheme(darkTheme);
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
      if (type.match('coverage')) {
        simpleIconsRender(`.doc-icon-coverage`);
        simpleIconsRender(`.doc-icon-coverage-link`);
      }
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
    // The observer fires on modal mutations, not on viewport changes; a rotate
    // or a window drag leaves the frame at its old height without this.
    Responsive.onChanged(resizeIframe, { key: ModalId });
    Modal.Data[ModalId].onCloseListener[ModalId] = () => {
      Responsive.offChanged(ModalId);
      if (unbindIframeLayoutSync) unbindIframeLayoutSync();
      if (swaggerThemeEventKey) delete ThemeEvents[swaggerThemeEventKey];
      closeModalRouteChangeEvent({ closedId: ModalId });
    };
  }
  static Data = [
    {
      type: 'repo',
      icon: html`<i class="fab fa-github"></i>`,
      text: `Last Release`,
      url: function () {
        const tokenOpts = Docs.Tokens['modal-docs'];
        if (tokenOpts && tokenOpts.lastReleaseUrl) return tokenOpts.lastReleaseUrl();
        return githubUrl(packageRepository());
      },
    },
    {
      type: 'demo',
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
        return `${getProxyPath()}docs/engine/${window.renderPayload.version.replace('v', '')}`;
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
    {
      type: 'coverage',
      icon: html`<img height="20" width="20" class="doc-icon-coverage" />`,
      text: `Coverage report`,
      url: function () {
        const tokenOpts = Docs.Tokens['modal-docs'];
        if (tokenOpts && tokenOpts.coverageUrl) return tokenOpts.coverageUrl();
        return `${getProxyPath()}docs/coverage`;
      },
      themeEvent: () => {
        if (s(`.doc-icon-coverage`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage`));
      },
    },
    {
      type: 'coverage-link',
      icon: html`<img height="20" width="20" class="doc-icon-coverage-link" />`,
      text: `Coverage`,
      url: function () {
        const tokenOpts = Docs.Tokens['modal-docs'];
        if (tokenOpts && tokenOpts.coverageLinkUrl) return tokenOpts.coverageLinkUrl();
        return coverallsUrl();
      },
      themeEvent: () => {
        if (s(`.doc-icon-coverage-link`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage-link`));
      },
    },
  ];
  static Tokens = {};
  static async instance(options = {}) {
    const { idModal } = options;
    Docs.Tokens[idModal] = options;
    setTimeout(() => {
      s(`.btn-docs-src`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'src' });
        await Docs.RenderModal('src', idModal);
      };
      s(`.btn-docs-api`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'api' });
        await Docs.RenderModal('api', idModal);
      };
      s(`.btn-docs-coverage`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'coverage' });
        await Docs.RenderModal('coverage', idModal);
      };
      s(`.btn-docs-coverage-link`).onclick = () => {
        const docData = Docs.Data.find((d) => d.type === 'coverage-link');
        location.href = docData.url();
      };
      s(`.btn-docs-repo`).onclick = () => {
        const docData = Docs.Data.find((d) => d.type === 'repo');
        location.href = docData.url();
      };
      s(`.btn-docs-demo`).onclick = () => {
        const docData = Docs.Data.find((d) => d.type === 'demo');
        location.href = docData.url();
      };
      listenQueryPathInstance({
        id: options.idModal,
        routeId: 'docs',
        event: (path) => {
          if (s(`.btn-docs-${path}`)) s(`.btn-docs-${path}`).click();
          if (Modal.mobileModal()) {
            setTimeout(() => {
              s(`.btn-close-modal-menu`).click();
            });
          }
        },
      });
    });
    // Register theme events for items that have them (Docs-specific concern)
    for (const docData of Docs.Data) {
      if (docData.themeEvent) {
        ThemeEvents[`doc-icon-${docData.type}`] = docData.themeEvent;
        setTimeout(ThemeEvents[`doc-icon-${docData.type}`]);
      }
    }
    // Build submenu items and populate — submenu system is owned by Modal
    Modal.subMenuPopulate('docs', await Modal.buildSubMenuItemsHtml('docs', Docs.Data, options));

    const landingCards = [
      {
        id: 'getting-started',
        icon: 'rocket',
        title: 'Getting Started',
        description: 'Learn the basics and get started with our platform',
        docType: 'src',
      },
      {
        id: 'api-docs',
        icon: 'code',
        title: 'API Reference',
        description: 'Detailed documentation of our API endpoints',
        docType: 'api',
      },
      {
        id: 'guides',
        icon: 'book',
        title: 'Guides',
        description: 'Step-by-step tutorials and how-to guides',
        docType: 'src',
      },
      {
        id: 'demo',
        icon: 'laptop-code',
        title: 'Demo',
        description: 'Practical examples and code snippets',
        docType: 'demo',
      },
      {
        id: 'faq',
        icon: 'question-circle',
        title: 'FAQ',
        description: 'Frequently asked questions',
        docType: 'src',
      },
      {
        id: 'community',
        icon: 'users',
        title: 'Community',
        description: 'Join our developer community',
        docType: 'repo',
      },
    ];

    // A card resolves to a documented entry, never to a URL of its own: the
    // submenu button and the card must open the same place.
    const openLandingCard = (docType) => {
      const btn = s(`.btn-docs-${docType}`);
      if (btn) return btn.click();
      location.href = Docs.Data.find((d) => d.type === docType).url();
    };

    setTimeout(() => {
      for (const { id, docType } of landingCards) {
        const cardEl = s(`.docs-card-container-${id}`);
        if (!cardEl) continue;
        cardEl.onclick = () => openLandingCard(docType);
        // The card is a div, so the keyboard affordances a button would carry
        // have to be declared and handled explicitly.
        cardEl.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          openLandingCard(docType);
        };
      }
    });

    return html`
      <style>
        .docs-landing {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .docs-header {
          text-align: center;
          margin-bottom: 3rem;
          opacity: 0;
          animation: fadeInUp 0.6s ease-out forwards;
        }
        .docs-header h1 {
          font-size: 2.5rem;
          margin: 0 0 1rem;
          line-height: 1.2;
        }
        .docs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
          gap: 1.5rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .docs-card-container {
          cursor: pointer;
          opacity: 0;
          animation: fadeInUp 0.6s ease-out forwards;
          border-radius: 8px;
        }
        .docs-card-container:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 3px;
        }
        .docs-card {
          border-radius: 8px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
          transition:
            transform 0.25s ease,
            background 0.25s ease,
            border-color 0.25s ease;
        }
        .docs-card-container:hover .docs-card,
        .docs-card-container:focus-visible .docs-card {
          transform: translateY(-4px);
        }
        .card-icon {
          font-size: 1.75rem;
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 0 1.25rem;
          transition: transform 0.25s ease;
        }
        .docs-card-container:hover .card-icon {
          transform: scale(1.08);
        }
        .card-content {
          flex: 1;
        }
        .card-content h3 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .card-content p {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.5;
          opacity: 0.85;
        }
        @media (prefers-reduced-motion: reduce) {
          .docs-header,
          .docs-card-container {
            animation: none;
            opacity: 1;
          }
          .docs-card,
          .card-icon {
            transition: none;
          }
          .docs-card-container:hover .docs-card,
          .docs-card-container:hover .card-icon {
            transform: none;
          }
        }
      </style>

      <style>
        ${landingCards
          .map(
            (_, index) => css`
              .docs-card-container:nth-child(${index + 1}) {
                animation-delay: ${0.1 * (index + 1)}s;
              }
            `,
          )
          .join('')}
      </style>

      <div class="docs-landing">
        <div class="docs-header">
          <h1>Documentation</h1>
        </div>

        <ul class="docs-grid">
          ${landingCards
            .map(
              ({ id, icon, title, description }) => html`
                <div
                  class="in docs-card-container docs-card-container-${id}"
                  role="link"
                  tabindex="0"
                  aria-label="${title}: ${description}"
                >
                  <li class="docs-card box-content-border hover">
                    <div class="card-icon">
                      <i class="fas fa-${icon}" aria-hidden="true"></i>
                    </div>
                    <div class="card-content">
                      <h3>${title}</h3>
                      <p>${description}</p>
                    </div>
                  </li>
                </div>
              `,
            )
            .join('')}
        </ul>
      </div>
    `;
  }
}
export { Docs };
