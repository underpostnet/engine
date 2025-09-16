import { getId } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const ToggleSwitch = {
  Tokens: {},
  Render: async function (options) {
    const id = options?.id ? options.id : getId(this.Tokens, 'toggle-switch-');
    this.Tokens[id] = {};

    const widthContent = 60;
    const widthCircle = 20;

    setTimeout(() => {
      switch (options.displayMode) {
        case 'checkbox':
          break;

        default:
          s(`.${id}-circle`).style.left = `0px`;
          break;
      }

      const onToggle = () => {
        switch (options.displayMode) {
          case 'checkbox':
            htmls(`.${id}-circle`, html`<i class="fas fa-check"></i>`);
            break;
          default:
            s(`.${id}-circle`).style.left = `${widthContent - widthCircle}px`;
            s(`.${id}-circle`).classList.add(`toggle-switch-active`);
            break;
        }
        s(`.${id}-checkbox`).checked = true;
        options?.on?.checked ? options.on.checked() : null;
      };
      const offToggle = () => {
        switch (options.displayMode) {
          case 'checkbox':
            htmls(`.${id}-circle`, html``);
            break;
          default:
            s(`.${id}-circle`).style.left = `0px`;
            s(`.${id}-circle`).classList.remove(`toggle-switch-active`);
            break;
        }
        s(`.${id}-checkbox`).checked = false;
        options?.on?.unchecked ? options.on.unchecked() : null;
      };

      const onClickEvent = () => {
        s(`.${id}-checkbox`).checked ? offToggle() : onToggle();
        logger.info(id, s(`.${id}-checkbox`).checked);
      };

      this.Tokens[id].click = onClickEvent;

      if (!options.disabledOnClick) s(`.${id}`).onclick = onClickEvent;

      setTimeout(() => {
        options?.checked ? onToggle() : null;
        logger.info(id, s(`.${id}-checkbox`).checked);
      });
    });

    if (options.type === 'checkbox') {
    }
    const htmlRender = html`
      ${options?.displayMode === 'checkbox'
        ? html`<div class="${options?.containerClass ? options.containerClass : 'inl box-content-border'} ${id}">
            <div class="in ${id}-content toggle-switch-content-checkbox">
              <div class="abs center ${id}-circle toggle-switch-circle-checkbox"></div>
            </div>
          </div>`
        : html`<div class="${options?.containerClass ? options.containerClass : 'inl box-content-border'} ${id}">
            <div class="in ${id}-content toggle-switch-content ">
              <div class="in ${id}-circle toggle-switch-circle"></div>
            </div>
          </div>`}
      <input type="checkbox" class="${id}-checkbox" style="display: none" />
    `;
    if (options.wrapper) {
      setTimeout(() => (s(`.toggle-form-container-${id}`).onclick = () => ToggleSwitch.Tokens[`${id}`].click()));
      return html`
        <div class="in toggle-form-container toggle-form-container-${id} hover">
          <div class="fl ">
            <div class="in fll" style="width: 70%">
              <div class="in">${options.wrapperLabel}</div>
            </div>
            <div class="in fll" style="width: 30%">${htmlRender}</div>
          </div>
        </div>
      `;
    }
    return htmlRender;
  },
};

export { ToggleSwitch };
