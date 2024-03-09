import { getId } from '../core/CommonJs.js';
import { Css, Themes, borderChar } from '../core/Css.js';
import { Modal } from '../core/Modal.js';
import { Responsive } from '../core/Responsive.js';
import { s } from '../core/VanillaJs.js';

const InteractionPanel = {
  Data: {},
  Render: async function (options = { id: 'interaction-panel' }) {
    const id = options?.id ? options.id : getId(this.Data, 'interaction-panel-');
    this.Data[id] = {};
    const style = {
      height: '60px',
      width: '180px',
      'z-index': 3,
      'font-size': '14px',
      overflow: 'hidden',
      resize: 'none',
    };
    let render = async () => html`${id}`;
    switch (id) {
      case 'user-interaction-panel':
        style.top = '130px';
        render = async () => html`${id}`;
        break;
      case 'map-interaction-panel':
        style.top = '60px';
        render = async () => html`<div class="abs display-current-face" style="${borderChar(2, 'black')}"></div> `;
        break;
      default:
        break;
    }
    const { barConfig } = await Themes[Css.currentTheme]();
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    barConfig.buttons.close.disabled = true;
    await Modal.Render({
      id,
      barConfig,
      html: render,
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

export { InteractionPanel };
