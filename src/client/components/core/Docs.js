import { Badge } from './Badge.js';
import { BtnIcon } from './BtnIcon.js';
import { Css, renderCssAttr, simpleIconsRender, ThemeEvents, Themes } from './Css.js';
import { buildBadgeToolTipMenuOption, Modal, renderViewTitle } from './Modal.js';
import { listenQueryPathInstance, setQueryPath, closeModalRouteChangeEvent, getProxyPath } from './Router.js';
import { htmls, s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const Docs = {
  RenderModal: async function (type, modalOptions) {
    const docData = this.Data.find((d) => d.type === type);
    const ModalId = `modal-docs-${docData.type}`;
    const { barConfig } = await Themes[Css.currentTheme]();

    await Modal.Render({
      barConfig,
      title: renderViewTitle(docData),
      id: ModalId,
      html: async () => {
        if (docData.renderHtml) return await docData.renderHtml();
        return html`
          <iframe
            class="in iframe-${ModalId}"
            style="width: 100%; border: none; background: white"
            src="${docData.url()}"
          >
          </iframe>
        `;
      },
      maximize: true,
      mode: 'view',
      route: 'docs',
      slideMenu: 'modal-menu',
      observer: true,
      barMode: 'top-bottom-bar',
      query: true,
      ...modalOptions,
    });
    Modal.Data[ModalId].onObserverListener[ModalId] = () => {
      if (s(`.iframe-${ModalId}`))
        s(`.iframe-${ModalId}`).style.height = `${s(`.${ModalId}`).offsetHeight - Modal.headerTitleHeight}px`;

      if (type.match('coverage')) {
        simpleIconsRender(`.doc-icon-coverage`);
        simpleIconsRender(`.doc-icon-coverage-link`);
      }
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
    Modal.Data[ModalId].onCloseListener[ModalId] = () => {
      closeModalRouteChangeEvent({ closedId: ModalId });
    };
  },
  Data: [
    {
      type: 'repo',
      icon: html`<i class="fab fa-github"></i>`,
      text: `Last Release`,
      url: function () {
        return `https://github.com/underpostnet/pwa-microservices-template-ghpkg/`;
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
        return `https://underpostnet.github.io/pwa-microservices-template-ghpkg/`;
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
        return `https://coveralls.io/github/underpostnet/engine`;
      },
      themeEvent: () => {
        if (s(`.doc-icon-coverage-link`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage-link`));
      },
    },
  ],
  Tokens: {},
  Init: async function (options) {
    const { idModal } = options;
    this.Tokens[idModal] = options;
    setTimeout(() => {
      const cleanActive = () => {
        s(`.btn-docs-src`).classList.remove('main-btn-menu-active');
        s(`.btn-docs-api`).classList.remove('main-btn-menu-active');
        s(`.btn-docs-coverage`).classList.remove('main-btn-menu-active');
      };
      s(`.btn-docs-src`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'src' });
        cleanActive();
        await this.RenderModal('src', options.modalOptions);
      };
      s(`.btn-docs-api`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'api' });
        cleanActive();
        await this.RenderModal('api', options.modalOptions);
      };
      s(`.btn-docs-coverage`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'coverage' });
        cleanActive();
        await this.RenderModal('coverage', options.modalOptions);
      };

      s(`.btn-docs-coverage-link`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'coverage-link');
        location.href = docData.url();
      };
      s(`.btn-docs-repo`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'repo');
        location.href = docData.url();
      };
      s(`.btn-docs-demo`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'demo');
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
    let docMenuRender = '';
    for (const docData of this.Data) {
      if (docData.themeEvent) {
        ThemeEvents[`doc-icon-${docData.type}`] = docData.themeEvent;
        setTimeout(ThemeEvents[`doc-icon-${docData.type}`]);
      }
      let tabHref, style, labelStyle;
      switch (docData.type) {
        case 'repo':
        case 'coverage-link':
          style = renderCssAttr({ style: { height: '45px' } });
          labelStyle = renderCssAttr({ style: { top: '8px', left: '9px' } });
          break;

        default:
          break;
      }
      tabHref = docData.url();
      docMenuRender += html`
        ${await BtnIcon.Render({
          class: `in wfa main-btn-menu submenu-btn btn-docs btn-docs-${docData.type}`,
          label: html`<span class="inl menu-btn-icon">${docData.icon}</span
            ><span class="menu-label-text menu-label-text-docs"> ${docData.text} </span>`,
          tabHref,
          tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption(docData.text, 'right')),
          useMenuBtn: true,
        })}
      `;
    }
    // s(`.menu-btn-container-children`).classList.remove('hide');
    // htmls(`.nav-path-display-${'modal-menu'}`, location.pathname);

    htmls('.menu-btn-container-children-docs', docMenuRender);

    {
      const docsData = [
        {
          id: 'getting-started',
          icon: 'rocket',
          title: 'Getting Started',
          description: 'Learn the basics and get started with our platform',
        },
        {
          id: 'api-docs',
          icon: 'code',
          title: 'API Reference',
          description: 'Detailed documentation of our API endpoints',
        },
        {
          id: 'guides',
          icon: 'book',
          title: 'Guides',
          description: 'Step-by-step tutorials and how-to guides',
        },
        {
          id: 'demo',
          icon: 'laptop-code',
          title: 'Demo',
          description: 'Practical examples and code snippets',
        },
        {
          id: 'faq',
          icon: 'question-circle',
          title: 'FAQ',
          description: 'Frequently asked questions',
        },
        {
          id: 'community',
          icon: 'users',
          title: 'Community',
          description: 'Join our developer community',
        },
      ];

      return html`
        <style>
          .docs-landing {
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
            height: 100%;
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
          .docs-header p {
            font-size: 1.2rem;
            max-width: 700px;
            margin: 0 auto 2rem;
            line-height: 1.6;
          }
          .docs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
            margin: 0;
            padding: 0;
            list-style: none;
          }
          .docs-card-container {
            cursor: pointer;
            opacity: 0;
            margin-bottom: 3rem;
            animation: fadeInUp 0.6s ease-out forwards;
          }
          .docs-card {
            border-radius: 8px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            height: 100%;
            position: relative;
            transition: all 0.3s ease-in-out;
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
            transition: transform 0.2s ease;
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
            transition: color 0.3s ease;
          }
        </style>

        <style>
          ${docsData
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
            <p>
              Find everything you need to build amazing applications with our platform. Get started with our guides, API
              reference, and examples.
            </p>
            <!--
                    <div class="search-bar">
                      <i class="fas fa-search"></i>
                      <input type="text" placeholder="Search documentation..." id="docs-search">
                    </div>
                    -->
          </div>

          <ul class="docs-grid">
            ${docsData
              .map((item) => {
                setTimeout(() => {
                  if (s(`.docs-card-container-${item.id}`)) {
                    s(`.docs-card-container-${item.id}`).onclick = () => {
                      if (item.id.match('demo')) {
                        location.href = 'https://underpostnet.github.io/pwa-microservices-template-ghpkg/';
                      } else if (item.id.match('api')) {
                        if (s(`.btn-docs-api`)) s(`.btn-docs-api`).click();
                      } else {
                        if (s(`.btn-docs-src`)) s(`.btn-docs-src`).click();
                      }
                    };
                  }
                });
                return html`
                  <div class="in docs-card-container docs-card-container-${item.id}">
                    <li class="docs-card">
                      <div class="card-icon">
                        <i class="fas fa-${item.icon}"></i>
                      </div>
                      <div class="card-content">
                        <h3>${item.title}</h3>
                        <p>${item.description}</p>
                      </div>
                    </li>
                  </div>
                `;
              })
              .join('')}
          </ul>
        </div>
      `;
    }
  },
};

export { Docs };
