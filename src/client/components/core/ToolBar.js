import { getId } from './CommonJs.js';
import { Themes, Css } from './Css.js';
import { Modal } from './Modal.js';
import { Responsive } from './Responsive.js';
import { s } from './VanillaJs.js';

const ToolBar = {
  Data: {},
  Render: async function (options = { id: 'ToolBar' }) {
    const id = options?.id ? options.id : getId(this.Data, 'ToolBar-');
    this.Data[id] = {};

    const style = {
      height: '40px',
      width: '180px',
      'z-index': 6, // ??
      'font-size': '18px',
      overflow: 'hidden',
      resize: 'none',
      // color: `#d9d9d9`,
      top: '10px',
      // right: '10px',
      border: '2px solid red',
    };

    const { barConfig } = await Themes[Css.currentTheme]();
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    barConfig.buttons.close.disabled = true;
    await Modal.Render({
      id,
      barConfig,
      html: async () => html`test`,
      titleClass: 'hide',
      style,
      dragDisabled: true,
    });
    Responsive.Event[id] = () => {
      s(`.${id}`).style.left = `${window.innerWidth - (180 + 10)}px`;
    };
    Responsive.Event[id]();
  },
};

export { ToolBar };
