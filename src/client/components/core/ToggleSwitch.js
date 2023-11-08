import { getId } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const ToggleSwitch = {
  Tokens: {},
  Render: async function (options) {
    const id = options?.id ? options.id : getId(this.Tokens, 'toggle-switch-');
    this.Tokens[id] = {};
    setTimeout(() => {
      s(`.${id}-circle`).style.left = `0px`;

      const onToggle = () => {
        s(`.${id}-circle`).style.left = `${s(`.${id}-content`).offsetWidth - s(`.${id}-circle`).offsetWidth}px`;
        s(`.${id}-checkbox`).checked = true;
        s(`.${id}-circle`).classList.add(`toggle-switch-active`);
        options?.on?.checked ? options.on.checked() : null;
      };
      const offToggle = () => {
        s(`.${id}-circle`).style.left = `0px`;
        s(`.${id}-checkbox`).checked = false;
        s(`.${id}-circle`).classList.remove(`toggle-switch-active`);
        options?.on?.unchecked ? options.on.unchecked() : null;
      };

      s(`.${id}`).onclick = () => {
        s(`.${id}-checkbox`).checked ? offToggle() : onToggle();
        logger.info(id, s(`.${id}-checkbox`).checked);
      };

      setTimeout(() => {
        options?.checked ? onToggle() : null;
        logger.info(id, s(`.${id}-checkbox`).checked);
      });
    });
    return html`
      <div class="inl toggle-switch-content-border ${id}">
        <div class="in ${id}-content toggle-switch-content ">
          <div class="in ${id}-circle toggle-switch-circle"></div>
          <input type="checkbox" class="${id}-checkbox" style="display: none" />
        </div>
      </div>
    `;
  },
};

export { ToggleSwitch };
