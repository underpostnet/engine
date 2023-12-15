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
      <div class="inl dropdown-container section-mp ">
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
                  if (optionData.value !== 'close') htmls(`.dropdown-current-${id}`, optionData.display);
                };
              });
              return html`
                <div
                  class="in dropdown-option dropdown-option-${id}-${i} dropdown-option-${optionData.value.replaceAll(
                    ' ',
                    '-',
                  )}"
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
