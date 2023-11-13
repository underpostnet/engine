import { getId } from './CommonJs.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';

const DropDown = {
  Tokens: {},
  Render: async function (options) {
    const id = getId(this.Tokens, 'dropdown-');
    if (!options.head.value) options.head.value = Translate.Render('select');
    options.head.value = html`<i class="fa-solid fa-caret-down"></i> ${options.head.value}`;
    this.Tokens[id] = {};
    options.list.push({
      value: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
      onClick: function () {
        console.log('DropDown onClick', this.value);
      },
    });
    setTimeout(() => {
      s(`.${id}-head`).onmouseover = () => s(`.${id}-content`).classList.remove('hide');
    });
    return html`
      <div class="in dropdown">
        <div class="in dropdown-option ${id}-head">${options.head.value}</div>
        <div class="dropdown-content ${id}-content">
          ${options.list
            .map((option, i) => {
              setTimeout(() => {
                s(`.option-${id}-${i}`).onclick = (e) => {
                  e.preventDefault();
                  if (i < options.list.length - 1)
                    htmls(`.${id}-head`, html`<i class="fa-solid fa-caret-down"></i> ${option.value}`);
                  option.onClick();
                  s(`.${id}-content`).classList.add('hide');
                };
              });
              return html`<div class="in dropdown-option option-${id}-${i}">${option.value}</div>`;
            })
            .join('')}
        </div>
      </div>
    `;
  },
};

export { DropDown };
