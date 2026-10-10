import { getId, newInstance } from './CommonJs.js';
import { s } from './VanillaJs.js';
class RichText {
  static Tokens = {};
  static async instance(options = { id: '', parentIdModal: '' }) {
    const id = options?.id ? options.id : getId(RichText.Tokens, 'rich-text-');
    RichText.Tokens[id] = {};
    setTimeout(() => {
      const easyMDE = new EasyMDE({
        element: s(`.${id}`),
        hideIcons: ['fullscreen', 'side-by-side'],
      });
      RichText.Tokens[id].easyMDE = easyMDE;
      // easyMDE.value();
      // easyMDE.value(val);
    });
    return html` <style>
        /* The edit box keeps the neutral face of the core theme under any app theme. */
        .md-container .EasyMDEContainer .CodeMirror,
        .md-container textarea {
          font-family: arial, sans-serif;
        }
      </style>
      <div class="in md-container"><textarea class="${id}"></textarea></div>`;
  }
}
export { RichText };
