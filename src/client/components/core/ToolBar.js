import { getId } from './CommonJs.js';
import { Themes, Css, darkTheme } from './Css.js';
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
      top: '5px',
      // right: '10px',
      // border: '1px solid red',
      'box-shadow': 'none !important',
    };

    let render = html`
      <div class="fl">
        <div class="in flr toolbar-slot toolbar-theme">
          <div class="abs center">
            <a> ${darkTheme ? html` <i class="fas fa-moon"></i>` : html`<i class="far fa-sun"></i>`}</a>
          </div>
          <!--
          <i class="fas fa-adjust"></i> 
          -->
        </div>
        <div class="in flr toolbar-slot toolbar-lang">
          <div class="abs center">
            <div class="abs center"><a>${s('html').lang}</a></div>
          </div>
        </div>
      </div>
    `;

    const { barConfig } = await Themes[Css.currentTheme]();
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    barConfig.buttons.close.disabled = true;
    await Modal.Render({
      id,
      barConfig,
      html: async () => render,
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
