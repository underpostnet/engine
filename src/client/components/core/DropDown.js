import { getId } from './CommonJs.js';
import { Input } from './Input.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';

const DropDown = {
  Tokens: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Tokens, 'dropdown-');
    return html`
      <div class="inl dropdown-container section-margin-padding ">
        ${await Input.Render({
          id: `search-box-${id}`,
          label: html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.Render('search')}`,
          containerClass: 'container-component',
          placeholder: true,
        })}
      </div>
    `;
  },
};

export { DropDown };
