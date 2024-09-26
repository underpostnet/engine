import { getId } from './CommonJs.js';
import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

const RichText = {
  Tokens: {},
  Render: async function (options = { id: '' }) {
    const id = options?.id ? options.id : getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    setTimeout(() => {
      const easyMDE = new EasyMDE({
        element: s(`.${id}`),
        onToggleFullScreen: (onFs) => {
          if (onFs) Modal.cleanUI();
          else Modal.restoreUI();
        },
      });
      this.Tokens[id].easyMDE = easyMDE;
      // easyMDE.value();
      // easyMDE.value(val);
    });
    return html` <style>
        .md-container {
          background: white;
          color: black;
        }
        .md-container button {
          color: black !important;
        }
      </style>
      <div class="in md-container"><textarea class="${id}"></textarea></div>`;
  },
};

export { RichText };
