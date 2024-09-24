import { getId } from './CommonJs.js';
import { s } from './VanillaJs.js';

const RichText = {
  Tokens: {},
  Render: async function (options = { id: '' }) {
    const id = options?.id ? options.id : getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    setTimeout(() => {
      const easyMDE = new EasyMDE({ element: s(`#${id}`) });
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
      <div class="in md-container"><textarea id="${id}"></textarea></div>`;
  },
};

export { RichText };
