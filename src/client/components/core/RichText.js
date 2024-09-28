import { getId, newInstance } from './CommonJs.js';
import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

const RichText = {
  Tokens: {},
  Render: async function (options = { id: '', parentIdModal: '' }) {
    const id = options?.id ? options.id : getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    let top, height;
    setTimeout(() => {
      const easyMDE = new EasyMDE({
        element: s(`.${id}`),
        onToggleFullScreen: (onFs) => {
          if (onFs) {
            if (options.parentIdModal) {
              s(`.btn-bar-modal-container-${options.parentIdModal}`).classList.add('hide');
              top = newInstance(s(`.${options.parentIdModal}`).style.top);
              height = newInstance(s(`.${options.parentIdModal}`).style.height);
              s(`.${options.parentIdModal}`).style.top = '0px';
              s(`.${options.parentIdModal}`).style.height = `${window.innerHeight}px`;
            }
            Modal.cleanUI();
          } else {
            if (options.parentIdModal) {
              s(`.btn-bar-modal-container-${options.parentIdModal}`).classList.remove('hide');
              s(`.${options.parentIdModal}`).style.top = top;
              s(`.${options.parentIdModal}`).style.height = height;
            }
            Modal.restoreUI();
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
