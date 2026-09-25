import { marked } from 'marked';
import { Modal } from './Modal.js';
import { Translate } from './Translate.js';
import { navigate } from './Router.js';
import { anchorFactory, s4 } from './CommonJs.js';
import { append, s, sanitizeHtml } from './VanillaJs.js';

/** Heading ids carry a prefix, so a heading in a user's post can never shadow a page global. */
const HEADING_ID_PREFIX = 'md-';

/** The containers a Markdown body renders inside: the renderer's own, and the editor preview. */
const MARKDOWN_CONTAINERS = ['.markdown-content', '.editor-preview', '.editor-preview-full', '.editor-preview-side'];

/** What a container renders Markdown with when its client sets no value of its own. */
const MARKDOWN_TOKENS = {
  'font-family': 'inherit',
  'font-size': '16px',
  'line-height': '1.65',
  'heading-font-family': 'inherit',
  'heading-color': 'inherit',
  h1: '1.9em',
  h2: '1.5em',
  h3: '1.25em',
  h4: '1.05em',
  'code-font-family': 'monospace',
  'code-font-size': '0.9em',
  border: 'rgba(128, 128, 128, 0.35)',
  surface: 'rgba(128, 128, 128, 0.12)',
  link: 'currentColor',
};

/**
 * The style a Markdown body renders under, scoped to the containers it renders inside. Every text
 * property is declared, so a global heading or paragraph rule of a theme cannot reach the body.
 * A client calls this again with its own containers and values to style the Markdown it shows.
 * A client scopes its containers by an ancestor, which is what makes its values win.
 * @param {object} [options]
 * @param {string} [options.id] - Class of the style tag, so a client can replace its own.
 * @param {string[]} [options.containers] - Container selectors the style applies to.
 * @param {object} [options.tokens] - Values that replace {@link MARKDOWN_TOKENS} in these containers.
 * @returns {string} A style tag.
 */
const markdownStyle = ({ id = 'markdown-style', containers = MARKDOWN_CONTAINERS, tokens = {} } = {}) => {
  const token = { ...MARKDOWN_TOKENS, ...tokens };
  const on = (selector = '') => containers.map((container) => `${container}${selector}`).join(', ');
  return html`<style class="${id}">
    ${on()} {
      font-family: ${token['font-family']};
      font-size: ${token['font-size']};
      line-height: ${token['line-height']};
      text-align: left;
      overflow-wrap: anywhere;
    }
    ${on(' p')},
    ${on(' li')},
    ${on(' td')},
    ${on(' th')},
    ${on(' span')},
    ${on(' div')} {
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
    }
    ${on(' h1')},
    ${on(' h2')},
    ${on(' h3')},
    ${on(' h4')},
    ${on(' h5')},
    ${on(' h6')} {
      font-family: ${token['heading-font-family']};
      color: ${token['heading-color']};
      text-shadow: none;
      font-weight: 600;
      line-height: 1.25;
      margin: 1.4em 0 0.6em;
    }
    ${on(' h1')} {
      font-size: ${token.h1};
    }
    ${on(' h2')} {
      font-size: ${token.h2};
    }
    ${on(' h3')} {
      font-size: ${token.h3};
    }
    ${on(' h4')},
    ${on(' h5')},
    ${on(' h6')} {
      font-size: ${token.h4};
    }
    ${on(' p')} {
      margin: 0 0 1em;
    }
    ${on(' ul')},
    ${on(' ol')} {
      margin: 0 0 1em;
      padding-left: 1.6em;
    }
    ${on(' li')} {
      margin: 0.3em 0;
    }
    ${on(' a')} {
      color: ${token.link};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    ${on(' code')} {
      font-family: ${token['code-font-family']};
      font-size: ${token['code-font-size']};
      background: ${token.surface};
      border-radius: 4px;
      padding: 1px 5px;
    }
    ${on(' pre')} {
      background: ${token.surface};
      border: 1px solid ${token.border};
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      margin: 0 0 1em;
    }
    ${on(' pre code')} {
      background: none;
      padding: 0;
    }
    ${on(' blockquote')} {
      margin: 0 0 1em;
      padding: 2px 14px;
      border-left: 3px solid ${token.border};
      opacity: 0.85;
    }
    ${on(' table')} {
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
      max-width: 100%;
      margin: 0 0 1em;
    }
    ${on(' th')},
    ${on(' td')} {
      border: 1px solid ${token.border};
      padding: 6px 10px;
      text-align: left;
    }
    ${on(' th')} {
      background: ${token.surface};
      font-weight: 600;
    }
    ${on(' img')} {
      max-width: 100%;
      height: auto;
    }
    ${on(' hr')} {
      border: none;
      border-top: 1px solid ${token.border};
      margin: 24px 0;
    }
    ${on(' > :first-child')} {
      margin-top: 0;
    }
    ${on(' > :last-child')} {
      margin-bottom: 0;
    }
  </style>`;
};

/** The element a `#anchor` of a rendered document names. */
const headingOf = (container, anchor) => container.querySelector(`[id="${HEADING_ID_PREFIX}${CSS.escape(anchor)}"]`);

/**
 * The HTML a Markdown body renders to, wherever a document body is shown. `marked` passes the raw
 * HTML an author writes through, so the result is sanitized: a stray `<style>` or `<script>` in a
 * post would otherwise swallow, or run inside, the panel around it. Headings get their anchors
 * after sanitizing, so no authored `id` survives. The page carries the base style from here on.
 * @param {string} markdown
 * @returns {string}
 */
const renderMarkdown = (markdown) => {
  if (!s(`.markdown-style`)) append('head', markdownStyle());
  const { body } = new DOMParser().parseFromString(
    `<body>${sanitizeHtml(marked.parse(`${markdown ?? ''}`))}`,
    'text/html',
  );
  const anchor = anchorFactory();
  for (const heading of body.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    heading.id = `${HEADING_ID_PREFIX}${anchor(heading.textContent)}`;
  return body.innerHTML;
};

const attachMarkdownLinkHandlers = (containerSelector) => {
  const container = s(containerSelector);
  if (!container || container.dataset.mdLinkHandler) return;
  container.dataset.mdLinkHandler = 'true';

  container.addEventListener('click', async (e) => {
    const link = e.target.closest('.markdown-content a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    e.preventDefault();
    if (href.startsWith('#')) {
      headingOf(container, decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const isExternal = href.startsWith('http://') || href.startsWith('https://');

    if (isExternal) {
      const result = await Modal.RenderConfirm({
        id: `external-link-${s4()}`,
        html: async () => html`
          <div class="in section-mp" style="text-align: center; padding: 20px;">
            <p>${Translate.instance('external-link-warning')}</p>
            <p style="word-break: break-all; margin-top: 10px;"><strong>${href}</strong></p>
          </div>
        `,
        icon: html`<i class="fas fa-external-link-alt"></i>`,
        style: {
          width: '350px',
          height: '500px',
          overflow: 'auto',
          'z-index': '11',
          resize: 'none',
        },
      });

      if (result && result.status === 'confirm') {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } else {
      navigate(href);
    }
  });
};

export { attachMarkdownLinkHandlers, headingOf, markdownStyle, renderMarkdown };
