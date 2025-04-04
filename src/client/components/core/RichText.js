import { getId, newInstance } from './CommonJs.js';
import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

const RichText = {
  Tokens: {},
  Render: async function (options = { id: '', parentIdModal: '' }) {
    const id = options?.id ? options.id : getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    setTimeout(() => {
      const easyMDE = new EasyMDE({
        element: s(`.${id}`),
        hideIcons: ['fullscreen', 'side-by-side'],
        onToggleFullScreen: (onFs) => {
          if (onFs) {
            if (options.parentIdModal) {
            }
            // Modal.cleanUI();
          } else {
            if (options.parentIdModal) {
            }
            // Modal.restoreUI();
          }
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
