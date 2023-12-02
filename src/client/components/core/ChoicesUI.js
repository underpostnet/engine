import * as ChoicesModule from 'choices.js';
import { sa, append, getProxyPath } from './VanillaJs.js';

// https://github.com/Choices-js/Choices/blob/master/public/index.html
// https://choices-js.github.io/Choices/

let Choices = ChoicesModule.default;

const ChoicesUI = {
  Render: async function () {
    if (!this.load) {
      Choices = window.Choices;
      append(
        'head',
        html`<link rel="stylesheet" type="text/css" href="${getProxyPath()}styles/choices.js/choices.min.css" /> `,
      );
      this.load = true;
    }
    setTimeout(() => {
      const genericExamples = sa('[data-trigger]');
      for (let i = 0; i < genericExamples.length; ++i) {
        const element = genericExamples[i];
        new Choices(element, {
          allowHTML: true,
          placeholderValue: 'This is a placeholder set in the config',
          searchPlaceholderValue: 'This is a search placeholder',
        });
      }
    });
    return html`
      <select data-trigger placeholder="This is a search placeholder">
        <option value="">This is a placeholder</option>
        <option value="Choice 1">Choice 1</option>
        <option value="Choice 2">Choice 2</option>
        <option value="Choice 3">Choice 3</option>
      </select>
    `;
  },
};

export { ChoicesUI };
