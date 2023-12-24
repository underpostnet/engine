import { getId } from './CommonJs.js';
import { Input } from './Input.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';

const DropDown = {
  Tokens: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Tokens, 'dropdown-');
    this.Tokens[id] = {};

    options.data.push({
      value: 'reset',
      display: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
      onClick: function () {
        console.log('DropDown onClick', this.value);
        if (options && options.resetOnClick) options.resetOnClick();
      },
    });

    options.data.push({
      value: 'close',
      display: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
      onClick: function () {
        console.log('DropDown onClick', this.value);
      },
    });

    const switchOptionsPanel = () => {
      if (Array.from(s(`.dropdown-option-${id}`).classList).includes('hide'))
        s(`.dropdown-option-${id}`).classList.remove('hide');
      else s(`.dropdown-option-${id}`).classList.add('hide');
    };

    setTimeout(() => {
      const indexValue = options.data.findIndex((t) => t.value === options.value);
      if (indexValue > -1) setTimeout(() => s(`.dropdown-option-${id}-${indexValue}`).click());

      s(`.dropdown-label-${id}`).onclick = switchOptionsPanel;
      s(`.dropdown-current-${id}`).onclick = switchOptionsPanel;
    });
    return html`
      <div class="inl dropdown-container">
        <div class="in dropdown-option dropdown-label-${id}">
          <i class="fa-solid fa-caret-down"> </i> ${options.label}
        </div>
        <div class="in dropdown-option dropdown-current-${id}"></div>
        <div class="in dropdown-option-${id} hide">
          <div class="in dropdown-option">
            ${await Input.Render({
              id: `search-box-${id}`,
              label: html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.Render('search')}`,
              containerClass: 'container-component',
              placeholder: true,
            })}
          </div>
          ${options.data
            .map((optionData, i) => {
              setTimeout(() => {
                s(`.dropdown-option-${id}-${i}`).onclick = (e) => {
                  s(`.dropdown-option-${id}`).classList.add('hide');
                  optionData.onClick(e);
                  if (optionData.value !== 'close') {
                    if (optionData.value !== 'reset') htmls(`.dropdown-current-${id}`, optionData.display);
                    else htmls(`.dropdown-current-${id}`, '');
                    this.Tokens[id].value = optionData.data;
                  }
                };
              });
              const valueDisplay = optionData.value.trim().replaceAll(' ', '-');
              return html`
                <div
                  class="in dropdown-option dropdown-option-${id}-${i} dropdown-option-${id}-${valueDisplay} dropdown-option-${valueDisplay} ${valueDisplay ===
                    'reset' &&
                  options &&
                  !(options.resetOption === true)
                    ? 'hide'
                    : ''}"
                >
                  ${optionData.display}
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },
};

export { DropDown };
