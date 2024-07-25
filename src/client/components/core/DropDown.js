import { getId, newInstance } from './CommonJs.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';

const DropDown = {
  Tokens: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Tokens, 'dropdown-');
    this.Tokens[id] = { onClickEvents: {}, lastSelectValue: undefined };

    options.data.push({
      value: 'reset',
      display: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
      onClick: () => {
        console.log('DropDown onClick', this.value);
        if (options && options.resetOnClick) options.resetOnClick();
        this.Tokens[id].value = undefined;
      },
    });

    if (!(options && options.disableClose))
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
      if (options.type === 'checkbox')
        options.data.map((optionData) => {
          const indexValue = options.data.findIndex((t) => optionData.checked && t.value === optionData.value);
          if (indexValue > -1) setTimeout(() => s(`.dropdown-option-${id}-${indexValue}`).click());
        });
      else {
        const indexValue = options.data.findIndex((t) => t.value === options.value);
        if (indexValue > -1) setTimeout(() => s(`.dropdown-option-${id}-${indexValue}`).click());
      }

      s(`.dropdown-label-${id}`).onclick = switchOptionsPanel;
      s(`.dropdown-current-${id}`).onclick = switchOptionsPanel;
      if (options && options.open) switchOptionsPanel();
    });

    let render = '';
    let index = -1;
    for (const optionData of options.data) {
      index++;
      const i = index;
      const valueDisplay = optionData.value.trim().replaceAll(' ', '-');
      setTimeout(() => {
        const onclick = (e) => {
          if (options && options.lastSelectClass && s(`.dropdown-option-${this.Tokens[id].lastSelectValue}`)) {
            s(`.dropdown-option-${this.Tokens[id].lastSelectValue}`).classList.remove(options.lastSelectClass);
          }
          this.Tokens[id].lastSelectValue = valueDisplay;
          if (options && options.lastSelectClass && s(`.dropdown-option-${this.Tokens[id].lastSelectValue}`)) {
            s(`.dropdown-option-${this.Tokens[id].lastSelectValue}`).classList.add(options.lastSelectClass);
          }

          if (
            !(options && options.disableClose) &&
            (options.type !== 'checkbox' || optionData.value === 'close' || optionData.value === 'reset')
          )
            s(`.dropdown-option-${id}`).classList.add('hide');

          if (options.type === 'checkbox' && ToggleSwitch.Tokens[`checkbox-role-${valueDisplay}`])
            ToggleSwitch.Tokens[`checkbox-role-${valueDisplay}`].click();
          if (optionData.value !== 'close') {
            if (optionData.value !== 'reset')
              htmls(
                `.dropdown-current-${id}`,
                options.type === 'checkbox'
                  ? options.data
                      .filter((d) => d.checked)
                      .map((v, i, a) => `${v.display}${i < a.length - 1 ? ',' : ''}`)
                      .join('')
                  : optionData.display,
              );
            else htmls(`.dropdown-current-${id}`, '');

            this.Tokens[id].value =
              options.type === 'checkbox' ? options.data.filter((d) => d.checked).map((d) => d.data) : optionData.data;

            console.warn('current value dropdown id:' + id, this.Tokens[id].value);

            s(`.${id}`).value = this.Tokens[id].value;

            optionData.onClick(e);
          }
        };

        this.Tokens[id].onClickEvents[`dropdown-option-${id}-${i}`] = onclick;
        this.Tokens[id].onClickEvents[`dropdown-option-${id}-${valueDisplay}`] = onclick;
        this.Tokens[id].onClickEvents[`dropdown-option-${valueDisplay}`] = onclick;

        s(`.dropdown-option-${id}-${i}`).onclick = onclick;
      });
      render += html`
        <div
          class="in dropdown-option dropdown-option-${id}-${i} dropdown-option-${id}-${valueDisplay} dropdown-option-${valueDisplay} ${valueDisplay ===
            'reset' &&
          options &&
          !(options.resetOption === true)
            ? 'hide'
            : ''}"
        >
          ${options.type === 'checkbox' && optionData.value !== 'close' && optionData.value !== 'reset'
            ? html`
                ${await ToggleSwitch.Render({
                  id: `checkbox-role-${valueDisplay}`,
                  type: 'checkbox',
                  disabledOnClick: true,
                  checked: optionData.checked,
                  on: {
                    unchecked: () => {
                      optionData.checked = false;
                    },
                    checked: () => {
                      optionData.checked = true;
                    },
                  },
                })}
              `
            : ''}${optionData.display}
        </div>
      `;
    }
    return html`
      <div class="inl dropdown-container ${id} ${options?.containerClass ? options.containerClass : ''}">
        <div class="in dropdown-option dropdown-label-${id} ${options && options.disableSelectLabel ? 'hide' : ''}">
          <i class="fa-solid fa-caret-down"> </i> ${options.label}
        </div>
        <div
          class="in dropdown-option dropdown-current-${id} ${options && options.disableSelectOptionsLabel
            ? 'hide'
            : ''}"
        ></div>
        <div class="in dropdown-option-${id} hide">
          <div class="in dropdown-option ${options && options.disableSearchBox ? 'hide' : ''}">
            ${await Input.Render({
              id: `search-box-${id}`,
              label: html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.Render('search')}`,
              containerClass: 'in',
              placeholder: true,
            })}
          </div>
          ${render}
        </div>
      </div>
    `;
  },
};

export { DropDown };
