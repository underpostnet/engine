import { getId, getIsoDate } from './CommonJs.js';
import { Css, renderCssAttr, Themes } from './Css.js';
import { Modal } from './Modal.js';
import { append, prepend, s } from './VanillaJs.js';
class Badge {
  static Tokens = {};
  static async instance(options = { id: '', type: 'circle-red', classList: '', text: '', style: '' }) {
    if (!options.id) options.id = getId(Badge.Tokens, 'badge-');
    else options.id = 'badge-' + options.id;
    if (options && options.style && !options.style.color) options.style.color = 'white';
    if (!options.classList) options.classList = '';
    const { id, type } = options;
    Badge.Tokens[id] = { ...options };
    switch (type) {
      case 'circle-red':
        options.classList += ' badge-notification-circle-red ';
        break;
      default:
        break;
    }
    return html`<div class="badge wfm ${options.classList} ${id}" style="${renderCssAttr(options)}">
      <div class="badge-text">${options?.text ? options.text : 'B'}</div>
    </div>`;
  }
}
export { Badge };
