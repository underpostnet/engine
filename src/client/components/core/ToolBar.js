import { getId } from './CommonJs.js';
import { Themes, Css, darkTheme } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { Modal } from './Modal.js';
import { Responsive } from './Responsive.js';
import { Translate } from './Translate.js';
import { append, htmls, s } from './VanillaJs.js';

const ToolBar = {
  Data: {},
  Render: async function (options = { id: 'ToolBar', tools: [] }) {
    const id = options?.id ? options.id : getId(this.Data, 'ToolBar-');
    this.Data[id] = {};
    const width = 200;
    const style = {
      height: '40px',
      width: `${width}px`,
      'z-index': 6, // ??
      'font-size': '18px',
      overflow: 'hidden',
      resize: 'none',
      // color: `#d9d9d9`,
      top: '5px',
      // right: '10px',
      // border: '1px solid red',
      'box-shadow': 'none !important',
      background: 'none',
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
      html: async () => html` <div class="fl ${id}-render"></div>`,
      titleClass: 'hide',
      style,
      dragDisabled: true,
    });
    Responsive.Event[id] = () => {
      s(`.${id}`).style.left = `${window.innerWidth - (width + 10)}px`;
    };
    Responsive.Event[id]();
    if (options.tools)
      for (const tool of options.tools.reverse()) {
        switch (tool.id) {
          case 'theme':
            this.toolBarThemeRender = () =>
              htmls(
                `.toolbar-theme-render`,
                html` <a> ${darkTheme ? html` <i class="fas fa-moon"></i>` : html`<i class="far fa-sun"></i>`}</a>`,
              );
            append(
              `.${id}-render`,
              html`
                <div class="in flr toolbar-slot toolbar-theme">
                  <div class="abs center toolbar-theme-render"></div>
                  <!--
          <i class="fas fa-adjust"></i> 
          -->
                </div>
              `,
            );
            this.toolBarThemeRender();
            EventsUI.onClick(`.toolbar-theme`, () => {
              let theme;
              if (darkTheme) theme = tool.themes.find((t) => !t.dark);
              else theme = tool.themes.find((t) => t.dark);
              if (s(`.dropdown-option-${theme.theme}`)) s(`.dropdown-option-${theme.theme}`).click();
              else Css.renderTheme(theme.theme);
            });
            break;
          case 'lang':
            this.toolBarLangRender = () => {};
            append(
              `.${id}-render`,
              html` <div class="in flr toolbar-slot toolbar-lang">
                <div class="abs center"><a class="toolbar-lang-render">${s('html').lang}</a></div>
              </div>`,
            );
            EventsUI.onClick(`.toolbar-lang`, () => {
              let lang = 'en';
              lang = tool.langs.find((l) => l !== s('html').lang);
              if (s(`.dropdown-option-${lang}`)) s(`.dropdown-option-${lang}`).click();
              else Translate.renderLang(lang);
            });
            break;
          case 'sign-up':
            append(
              `.${id}-render`,
              html` <div class="in flr toolbar-slot toolbar-sign-up">
                <div class="abs center">${tool.icon ? tool.icon : html`sign<br />up`}</div>
              </div>`,
            );
            s(`.toolbar-sign-up`).onclick = () => s(`.main-btn-sign-up`).click();
            break;
          case 'log-in':
            append(
              `.${id}-render`,
              html` <div class="in flr toolbar-slot toolbar-log-in">
                <div class="abs center">${tool.icon ? tool.icon : html`log<br />in`}</div>
              </div>`,
            );
            s(`.toolbar-log-in`).onclick = () => s(`.main-btn-log-in`).click();
            break;

          default:
            break;
        }
      }
  },
};

export { ToolBar };
