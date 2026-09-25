import { attachMarkdownLinkHandlers, renderMarkdown } from './Markdown.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath } from './Router.js';
import { escapeHtml, htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

/**
 * The landing of a domain: its overview document, rendered in place. The document is addressed
 * by its identity, and the build publishes it at that path.
 */
class MainBodyDocument {
  /** Where the build publishes a document of the documentation tree. */
  static url(path) {
    return `${getProxyPath()}docs/${path}.md`;
  }

  /**
   * @param {Object} options
   * @param {string} options.domain - Domain whose overview is the landing, e.g. `object-layer`.
   */
  static async instance({ domain }) {
    const id = 'main-body-document';
    const document = `${domain}/overview/index`;
    const url = MainBodyDocument.url(document);

    setTimeout(async () => {
      try {
        const response = await fetch(url);
        // A document that does not answer reads as a failure, never as an empty landing.
        if (!response.ok) throw Object.assign(new Error(`answered ${response.status}`), { status: response.status });
        htmls(`.${id}-render`, html`<div class="markdown-content">${renderMarkdown(await response.text())}</div>`);
        attachMarkdownLinkHandlers(`.${id}-render`);
      } catch (error) {
        logger.error(`Failed to load ${url}`, error);
        htmls(
          `.${id}-render`,
          html`<div class="in section-mp">
            <h3><i class="fas fa-exclamation-circle"></i> ${escapeHtml(document)} unavailable</h3>
            <p>${escapeHtml(url)}: ${escapeHtml(error.message)}</p>
          </div>`,
        );
      }
      if (s(`.${id}-loading`)) s(`.${id}-loading`).classList.add('hide');
    });

    return html`
      <style>
        .${id} {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 16px 60px;
          text-align: left;
        }
        .${id}-loading {
          padding: 24px 0;
          opacity: 0.7;
        }
      </style>
      <div class="in ${id}">
        <div class="in ${id}-loading">
          <i class="fa-solid fa-circle-notch fa-spin"></i>
        </div>
        <div class="in ${id}-render"></div>
      </div>
    `;
  }
}

export { MainBodyDocument };
