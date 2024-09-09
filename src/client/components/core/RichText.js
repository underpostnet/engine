import { getId } from './CommonJs.js';
import { s } from './VanillaJs.js';

const RichText = {
  Tokens: {},
  Render: async function () {
    const id = getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    setTimeout(() => {
      const easyMDE = new EasyMDE({ element: s(`#${id}`) });
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
