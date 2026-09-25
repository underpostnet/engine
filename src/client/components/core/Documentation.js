import { attachMarkdownLinkHandlers, headingOf, renderMarkdown } from './Markdown.js';
import { documentationHref } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath, listenQueryParamsChange, setQueryParams } from './Router.js';
import { escapeHtml, htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

/**
 * The documentation the instance publishes: its navigation comes from the manifest the build
 * writes from the documentation tree, never from links inside the prose. A document is addressed
 * by its identity, `<domain>/<category>/<slug>`, which is also its public path.
 *
 * A view navigates one domain: the one its shell owns. The instance publishes the whole tree, so
 * a link that leaves the domain still opens the document it names.
 */
class Documentation {
  /** The published navigation, read once per page. */
  static manifest = null;
  /** Identity of the document on screen, so a URL change to it does not render it twice. */
  static current = null;
  /** Space in pixels below the bar of the host modal, for the view, the sticky navigation and a heading. */
  static gap = 24;

  /** Where the build publishes the navigation and every document. */
  static url(path = '') {
    return `${getProxyPath()}docs/${path}`;
  }

  /** The docs-view link of a document, the same one the build rewrites authored links to. */
  static href(path, anchor = '') {
    return documentationHref(getProxyPath(), path, anchor);
  }

  /** The document identity and anchor a docs-view link names, or null for any other link. A bare
   * anchor names the document on screen. */
  static target(href) {
    const url = new URL(href, location.href);
    const path = href.startsWith('#') ? Documentation.current : url.searchParams.get('doc');
    return path === null ? null : { path, anchor: decodeURIComponent(url.hash.slice(1)) };
  }

  /** The modal that scrolls a view, and the sticky bar that covers its top. */
  static host(id) {
    const modal = s(`.${id}`)?.closest('.modal');
    return { modal, bar: modal?.querySelector('.bar-default-modal') };
  }

  /** Fits the sticky navigation into the part of the host modal below its bar. */
  static fit(id) {
    const { modal, bar } = Documentation.host(id);
    if (!modal) return;
    const { style } = s(`.${id}`);
    style.setProperty(`--${id}-bar`, `${bar?.offsetHeight ?? 0}px`);
    style.setProperty(`--${id}-height`, `${modal.clientHeight}px`);
  }

  /**
   * Scrolls the host modal until the element is below its bar. Without an element, it scrolls to
   * the top of the view. Only the modal scrolls, never the page below it.
   */
  static reveal(id, element, behavior = 'auto') {
    const { modal, bar } = Documentation.host(id);
    if (!modal) return;
    const offset = element
      ? element.getBoundingClientRect().top - modal.getBoundingClientRect().top - modal.clientTop
      : 0;
    modal.scrollTo({
      top: element ? modal.scrollTop + offset - (bar?.offsetHeight ?? 0) - Documentation.gap : 0,
      behavior,
    });
  }

  /** Scrolls the navigation until its active link is visible. */
  static follow(id) {
    const nav = s(`.${id}-nav`);
    const active = nav?.querySelector(`.${id}-link-active`);
    if (!active) return;
    const box = nav.getBoundingClientRect();
    const link = active.getBoundingClientRect();
    if (link.top < box.top || link.bottom > box.bottom)
      nav.scrollTop += link.top - box.top - (nav.clientHeight - link.height) / 2;
  }

  /**
   * The navigation the build published.
   * @returns {Promise<{domains: Array}>}
   */
  static async navigation() {
    if (Documentation.manifest) return Documentation.manifest;
    const response = await fetch(Documentation.url('manifest.json'));
    if (!response.ok) throw Object.assign(new Error(`answered ${response.status}`), { status: response.status });
    Documentation.manifest = await response.json();
    return Documentation.manifest;
  }

  /** The domains a view navigates: the one it owns, or every published domain. */
  static domains(manifest, domain = '') {
    if (!domain) return manifest.domains;
    const owned = manifest.domains.find((published) => published.id === domain);
    if (!owned) throw new Error(`the instance publishes no domain "${domain}"`);
    return [owned];
  }

  /** Every document of a domain list, in reading order: what previous and next step through. */
  static order(domains = []) {
    return domains.flatMap((domain) =>
      domain.categories.flatMap((category) =>
        category.documents.map((document) => ({ ...document, domain: domain.title, category: category.title })),
      ),
    );
  }

  /**
   * Renders one document and the navigation around it.
   * @param {Object} options
   * @param {string} options.path - Document identity, `<domain>/<category>/<slug>`, or empty for
   *   the first document of the navigation.
   * @param {string} [options.domain] - Domain the view navigates; every domain when empty.
   * @param {string} [options.id] - Container id, for a view that hosts more than one.
   * @param {string} [options.anchor] - Heading to scroll to once the document renders.
   * @param {boolean} [options.top] - Without an anchor, scroll to the top of the view, not to the
   *   document.
   */
  static async render({ path, domain = '', id = 'documentation', anchor = '', top = false }) {
    Documentation.current = path;
    let heading = null;
    try {
      const manifest = await Documentation.navigation();
      const domains = Documentation.domains(manifest, domain);
      const documents = Documentation.order(domains);
      // A link out of the domain opens the document it names: the instance publishes the tree.
      const published = domain ? Documentation.order(manifest.domains) : documents;
      const current = path ? published.find((document) => document.path === path) : documents[0];
      if (!current) throw new Error(path ? 'is not a published document' : 'the instance publishes no documents');

      const response = await fetch(Documentation.url(current.url.replace(/^docs\//, '')));
      if (!response.ok) throw Object.assign(new Error(`answered ${response.status}`), { status: response.status });
      const body = await response.text();
      // A newer render owns the view.
      if (Documentation.current !== path) return;

      htmls(
        `.${id}-nav`,
        domains
          .map(
            (navDomain) => html`
              <div class="in ${id}-domain">
                <div class="${id}-domain-title">
                  <span class="${id}-domain-name">${escapeHtml(navDomain.title)}</span>
                  ${navDomain.maturity ? html`<span class="${id}-maturity">${escapeHtml(navDomain.maturity)}</span>` : ''}
                </div>
                ${navDomain.identity ? html`<div class="${id}-identity">${escapeHtml(navDomain.identity)}</div>` : ''}
                ${navDomain.categories
                  .map(
                    (category) => html`
                      <div class="${id}-category">${escapeHtml(category.title)}</div>
                      ${category.documents
                        .map(
                          (document) => html`
                            <a
                              class="in ${id}-link hover ${document.path === current.path ? `${id}-link-active` : ''}"
                              href="${Documentation.href(document.path)}"
                              >${escapeHtml(document.title)}</a
                            >
                          `,
                        )
                        .join('')}
                    `,
                  )
                  .join('')}
              </div>
            `,
          )
          .join(''),
      );

      // A document the navigation does not carry has no place in the reading order, so it offers
      // no step: the reader came in by a link from another domain.
      const index = documents.findIndex((document) => document.path === current.path);
      const step = (document, label, arrow) =>
        document
          ? html`<a class="in ${id}-step box-content-border hover" href="${Documentation.href(document.path)}">
              <span class="${id}-step-label">${arrow} ${label}</span>
              <span class="${id}-step-title">${escapeHtml(document.title)}</span>
            </a>`
          : html`<span class="in ${id}-step-empty"></span>`;
      htmls(
        `.${id}-render`,
        html`
          <div class="${id}-breadcrumb">
            ${escapeHtml(current.domain)} <span class="${id}-breadcrumb-mark">/</span> ${escapeHtml(current.category)}
          </div>
          <div class="markdown-content">${renderMarkdown(body)}</div>
          <div class="${id}-steps">
            ${
              index === -1
                ? ''
                : `${step(documents[index - 1], 'Previous', '←')}${step(documents[index + 1], 'Next', '→')}`
            }
          </div>
        `,
      );
      attachMarkdownLinkHandlers(`.${id}-render`);
      heading = anchor && headingOf(s(`.${id}-render`), anchor);
    } catch (error) {
      logger.error(`Failed to render documentation ${path}`, error);
      htmls(
        `.${id}-render`,
        html`<div class="in section-mp">
          <h3><i class="fas fa-exclamation-circle"></i> Documentation unavailable</h3>
          <p>${escapeHtml(path || 'index')}: ${escapeHtml(error.message)}</p>
        </div>`,
      );
    }
    if (s(`.${id}-loading`)) s(`.${id}-loading`).classList.add('hide');
    // On a narrow screen the navigation is above the document. A step scrolls past it.
    Documentation.reveal(id, heading || (top ? null : s(`.${id}-render`)));
    Documentation.follow(id);
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.path] - Document to open; the first document of the domain by default.
   * @param {string} [options.domain] - Domain the view navigates; every domain when empty.
   */
  static async instance({ path = '', domain = '' } = {}) {
    const id = 'documentation';
    setTimeout(() => {
      const view = s(`.${id}`);
      const { modal, bar } = Documentation.host(id);
      if (modal) {
        const observer = new ResizeObserver(() => (view.isConnected ? Documentation.fit(id) : observer.disconnect()));
        observer.observe(modal);
        if (bar) observer.observe(bar);
      }
      Documentation.render({ path, domain, id, anchor: decodeURIComponent(location.hash.slice(1)), top: true });
      // History back and forward change the URL under the view: it follows.
      listenQueryParamsChange({
        id: `${id}-query`,
        event: (params) => {
          if (s(`.${id}`) && (params.doc ?? '') !== (Documentation.current ?? ''))
            Documentation.render({
              id,
              domain,
              path: params.doc ?? '',
              anchor: decodeURIComponent(location.hash.slice(1)),
            });
        },
      });
      // A link to a different document opens it here, before the generic link handler sees it.
      // A link into the document on screen only scrolls.
      view?.addEventListener(
        'click',
        (event) => {
          const link = event.target.closest('a[href]');
          const target = link && Documentation.target(link.getAttribute('href'));
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          if (target.path === Documentation.current) {
            const render = s(`.${id}-render`);
            Documentation.reveal(id, (target.anchor && headingOf(render, target.anchor)) || render, 'smooth');
          } else {
            Documentation.render({ id, domain, ...target });
            setQueryParams({ doc: target.path }, { replace: false });
          }
          // The URL names the anchor of this document, never one left from the last.
          history.replaceState(
            history.state,
            '',
            `${location.pathname}${location.search}${target.anchor ? `#${target.anchor}` : ''}`,
          );
        },
        true,
      );
    });
    return html`
      <style>
        .${id} {
          display: flex;
          gap: 32px;
          align-items: flex-start;
          max-width: 1400px;
          margin: 0 auto;
          padding: ${Documentation.gap}px 20px 48px;
          text-align: left;
        }
        .${id}-nav {
          flex: 0 0 272px;
          position: sticky;
          top: calc(var(--${id}-bar, 0px) + ${Documentation.gap}px);
          max-height: calc(var(--${id}-height, 100vh) - var(--${id}-bar, 0px) - ${2 * Documentation.gap}px);
          overflow: auto;
          overscroll-behavior: contain;
          padding-right: 8px;
        }
        .${id}-domain-title {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 4px;
          padding: 0 8px;
        }
        .${id}-domain-name {
          font-size: 17px;
          font-weight: 700;
        }
        .${id}-maturity {
          font-size: 11px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          border: 1px solid rgba(128, 128, 128, 0.5);
          border-radius: 10px;
          padding: 2px 8px;
          white-space: nowrap;
        }
        .${id}-identity {
          font-size: 12px;
          line-height: 1.4;
          opacity: 0.65;
          margin: 0 0 12px;
          padding: 0 8px;
        }
        .${id}-category {
          font-size: 11px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          opacity: 0.6;
          margin: 18px 0 6px;
          padding: 0 8px;
        }
        .${id}-link {
          display: block;
          padding: 7px 10px;
          margin: 2px 0;
          border-radius: 6px;
          border-left: 2px solid transparent;
          text-decoration: none;
          font-size: 14px;
          line-height: 1.35;
          cursor: pointer;
          transition: 0.2s;
        }
        .${id}-link-active {
          border-left-color: currentColor;
          background: rgba(128, 128, 128, 0.18);
          font-weight: 700;
        }
        .${id}-body {
          flex: 1 1 auto;
          min-width: 0;
        }
        .${id}-breadcrumb {
          font-size: 12px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          opacity: 0.6;
          margin-bottom: 12px;
        }
        .${id}-breadcrumb-mark {
          opacity: 0.5;
          margin: 0 4px;
        }
        .${id}-steps {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 48px;
        }
        .${id}-step {
          flex: 1 1 0;
          max-width: 320px;
          border-radius: 6px;
          padding: 12px 14px;
          text-decoration: none;
          cursor: pointer;
          transition: 0.2s;
        }
        .${id}-step:last-child {
          text-align: right;
        }
        .${id}-step-empty {
          flex: 1 1 0;
        }
        .${id}-step-label {
          display: block;
          font-size: 11px;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          opacity: 0.6;
          margin-bottom: 4px;
        }
        .${id}-step-title {
          display: block;
          font-size: 14px;
          font-weight: 600;
        }
        .${id}-loading {
          padding: 24px 0;
          opacity: 0.7;
        }
        @media (max-width: 900px) {
          .${id} {
            display: block;
            padding: 16px 14px 40px;
          }
          .${id}-nav {
            position: static;
            max-height: none;
            margin-bottom: 28px;
            padding: 0 0 20px;
            border-bottom: 1px solid rgba(128, 128, 128, 0.35);
          }
          .${id}-steps {
            flex-direction: column;
          }
          .${id}-step,
          .${id}-step:last-child {
            max-width: none;
            text-align: left;
          }
        }
      </style>
      <div class="in ${id}">
        <nav class="in ${id}-nav"></nav>
        <div class="in ${id}-body">
          <div class="in ${id}-loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
          <div class="in ${id}-render"></div>
        </div>
      </div>
    `;
  }
}

export { Documentation };
