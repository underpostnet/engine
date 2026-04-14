import { Badge } from './Badge.js';
import { getId, newInstance } from './CommonJs.js';
import { darkTheme, ThemeEvents } from './Css.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';

const DropDown = {
  Tokens: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Tokens, 'dropdown-');
    this.Tokens[id] = {
      onClickEvents: {},
      lastSelectValue: undefined,
      oncheckvalues: {},
      originData: options.data ? newInstance(options.data) : [],
    };

    const _renderSelectedBadges = async () => {
      if (options.type !== 'checkbox') return;
      const container = s(`.dropdown-current-${id}`);
      if (!container) return;
      const selected = Object.entries(DropDown.Tokens[id].oncheckvalues);
      if (selected.length === 0) {
        htmls(`.dropdown-current-${id}`, '');
        return;
      }
      let badgesHtml = '';
      for (const [key, val] of selected) {
        badgesHtml += html`<span class="inl" style="display:inline-flex;align-items:center;margin:2px;">
          ${await Badge.Render({
            text: html`<i class="fa-solid fa-tag" style="margin-right:3px;font-size:9px;"></i>${val.display}`,
            style: {
              background: darkTheme ? '#335' : '#cde',
              color: darkTheme ? '#adf' : '#246',
              'border-radius': '4px',
              'font-size': '11px',
              height: 'auto',
              'min-width': 'auto',
            },
          })}
          <span
            class="dd-badge-del-${id}"
            data-key="${key}"
            style="cursor:pointer;padding:0 4px;font-size:14px;color:${darkTheme ? '#f88' : '#a00'};line-height:1;"
            >&times;</span
          >
        </span>`;
      }
      htmls(`.dropdown-current-${id}`, badgesHtml);
      container.querySelectorAll(`.dd-badge-del-${id}`).forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const key = btn.dataset.key;
          delete DropDown.Tokens[id].oncheckvalues[key];
          const dataItem = options.data.find((d) => d.value.trim().replaceAll(' ', '-') === key);
          if (dataItem) dataItem.checked = false;
          if (ToggleSwitch.Tokens[`checkbox-role-${key}`]) {
            const checkbox = s(`.checkbox-role-${key}-checkbox`);
            if (checkbox && checkbox.checked) ToggleSwitch.Tokens[`checkbox-role-${key}`].click();
          }
          DropDown.Tokens[id].value = Object.values(DropDown.Tokens[id].oncheckvalues).map((v) => v.data);
          s(`.${id}`).value = DropDown.Tokens[id].value;
          await _renderSelectedBadges();
        };
      });
    };
    DropDown.Tokens[id]._renderSelectedBadges = _renderSelectedBadges;

    options.data.push({
      value: 'reset',
      display: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
      onClick: () => {
        console.log('DropDown onClick', this.value);
        if (options && options.resetOnClick) options.resetOnClick();
        if (options && options.type === 'checkbox') {
          DropDown.Tokens[id].oncheckvalues = {};
          DropDown.Tokens[id].value = [];
          s(`.${id}`).value = [];
          htmls(`.dropdown-current-${id}`, '');
          if (options.serviceProvider) {
            htmls(`.${id}-render-container`, '');
          } else {
            for (const optionData of options.data) {
              if (optionData.value !== 'reset' && optionData.value !== 'close' && optionData.checked) {
                optionData.checked = false;
                const vd = optionData.value.trim().replaceAll(' ', '-');
                if (ToggleSwitch.Tokens[`checkbox-role-${vd}`]) {
                  const checkbox = s(`.checkbox-role-${vd}-checkbox`);
                  if (checkbox && checkbox.checked) ToggleSwitch.Tokens[`checkbox-role-${vd}`].click();
                }
              }
            }
          }
        } else this.Tokens[id].value = undefined;
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

    const _render = async (data) => {
      let render = '';
      let index = -1;
      for (const optionData of data) {
        index++;
        const i = index;
        const valueDisplay = optionData.value.trim().replaceAll(' ', '-');
        setTimeout(() => {
          const onclick = async (e) => {
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
              if (optionData.value !== 'reset') {
                if (options.type === 'checkbox') {
                  _renderSelectedBadges();
                } else {
                  htmls(`.dropdown-current-${id}`, optionData.display);
                }
              } else htmls(`.dropdown-current-${id}`, '');

              this.Tokens[id].value =
                options.type === 'checkbox'
                  ? options.serviceProvider
                    ? Object.values(DropDown.Tokens[id].oncheckvalues).map((v) => v.data)
                    : data.filter((d) => d.checked).map((d) => d.data)
                  : optionData.data;

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
                        delete DropDown.Tokens[id].oncheckvalues[valueDisplay];
                      },
                      checked: () => {
                        optionData.checked = true;
                        DropDown.Tokens[id].oncheckvalues[valueDisplay] = {
                          data: optionData.data,
                          display: optionData.display,
                          value: optionData.value,
                        };
                      },
                    },
                  })}
                `
              : ''}${optionData.display}
          </div>
        `;
      }
      return { render, index };
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

      if (options.type === 'checkbox') {
        ThemeEvents[`dropdown-badge-${id}`] = () => _renderSelectedBadges();
      }

      const dropDownSearchHandle = async () => {
        const _data = [];
        if (!s(`.search-box-${id}`)) return;

        let _value = s(`.search-box-${id}`).value.toLowerCase();

        for (const objData of options.data) {
          if (
            options.excludeSelected &&
            options.type === 'checkbox' &&
            DropDown.Tokens[id].oncheckvalues[objData.value.trim().replaceAll(' ', '-')]
          )
            continue;
          const objValue = objData.value.toLowerCase();
          if (
            objValue.match(_value) ||
            (Translate.Data[objData.value] &&
              Object.keys(Translate.Data[objData.value]).find((t) =>
                Translate.Data[objData.value][t].toLowerCase().match(_value),
              ))
          ) {
            _data.push(objData);
          }
        }

        if (_data.length > 0) {
          const { render, index } = await _render(_data);
          htmls(`.${id}-render-container`, render);
        } else {
          // const { render, index } = await _render(options.data);
          htmls(
            `.${id}-render-container`,
            html` <div class="inl" style="padding: 10px; color: red">
              <i class="fas fa-exclamation-circle"></i> ${Translate.Render('no-result-found')}
            </div>`,
          );
        }
      };

      if (options.serviceProvider) {
        let serviceSearchTimeout = null;
        s(`.search-box-${id}`).oninput = () => {
          clearTimeout(serviceSearchTimeout);
          const q = s(`.search-box-${id}`).value.trim();
          if (!q) {
            htmls(`.${id}-render-container`, '');
            return;
          }
          serviceSearchTimeout = setTimeout(async () => {
            try {
              let results = await options.serviceProvider(q);
              if (options.type === 'checkbox') {
                if (options.excludeSelected) {
                  const selectedKeys = Object.keys(DropDown.Tokens[id].oncheckvalues);
                  results = results.filter((item) => !selectedKeys.includes(item.value.trim().replaceAll(' ', '-')));
                }
                results = results.map((item) => {
                  const vd = item.value.trim().replaceAll(' ', '-');
                  return { ...item, checked: !!DropDown.Tokens[id].oncheckvalues[vd] };
                });
              }
              const controlItems = options.data.filter((d) => d.value === 'reset' || d.value === 'close');
              const allData = [...results, ...controlItems];
              if (allData.length > controlItems.length) {
                const { render } = await _render(allData);
                htmls(`.${id}-render-container`, render);
              } else {
                htmls(
                  `.${id}-render-container`,
                  html` <div class="inl" style="padding: 10px; color: red">
                    <i class="fas fa-exclamation-circle"></i> ${Translate.Render('no-result-found')}
                  </div>`,
                );
              }
            } catch (e) {
              console.error('DropDown serviceProvider error:', e);
            }
          }, 200);
        };
      } else {
        s(`.search-box-${id}`).oninput = dropDownSearchHandle;
      }

      // Not use onblur generate bug on input toggle
      // s(`.search-box-${id}`).onblur = dropDownSearchHandle;
    });

    const { render, index } = await _render(options.data);

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
          <div class="${id}-render-container">${render}</div>
        </div>
      </div>
    `;
  },
};

export { DropDown };
