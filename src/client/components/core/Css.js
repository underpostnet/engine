import { CssCoreDark, CssCoreLight } from './CssCore.js';
import { DropDown } from './DropDown.js';
import { Modal } from './Modal.js';
import { Translate } from './Translate.js';
import { append, getProxyPath, htmls, s } from './VanillaJs.js';

let ThemesScope = [];

// https://css.github.io/csso/csso.html
// https://www.fontspace.com/
// https://www.1001fonts.com/

const Css = {
  loadThemes: async function (themes = []) {
    ThemesScope = [];
    for (const themeOptions of themes) addTheme(themeOptions);
    // if (!ThemesScope.find((t) => t.dark)) addTheme(CssCoreDark);
    // if (!ThemesScope.find((t) => !t.dark)) addTheme(CssCoreLight);
    if (ThemesScope.length === 0) {
      addTheme(CssCoreDark);
      addTheme(CssCoreLight);
    }
    const localStorageTheme = localStorage.getItem('theme');
    if (localStorageTheme && Themes[localStorageTheme]) {
      const themeOption = ThemesScope.find((t) => t.theme === localStorageTheme);
      if (themeOption) return await this.Init(themeOption);
    }
    await this.Init();
  },
  Init: async function (options) {
    if (!options) options = ThemesScope[0];
    const { theme } = options;
    append(
      'body',
      html`
        <style>
          html {
            scroll-behavior: smooth;
          }

          body {
            /* overscroll-behavior: contain; */
            /* box-sizing: border-box; */
            padding: 0px;
            margin: 0px;
          }

          .fl {
            position: relative;
            display: flow-root;
          }

          .abs,
          .in {
            display: block;
          }

          .fll {
            float: left;
          }

          .flr {
            float: right;
          }

          .abs {
            position: absolute;
          }

          .in,
          .inl {
            position: relative;
          }

          .inl {
            display: inline-table;
            display: -webkit-fill-inline-table;
            display: -moz-inline-table;
            display: -ms-inline-table;
            display: -o-fill-inline-table;
          }

          .fix {
            position: fixed;
            display: block;
          }

          .stq {
            position: sticky;
            /* require defined at least top, bottom, left o right */
          }

          .wfa {
            width: fill-available;
            width: -webkit-fill-available;
            width: -moz-available;
            width: -ms-available;
            width: -o-fill-available;
          }

          .negative-color {
            filter: invert(1);
            -webkit-filter: invert(1);
            -moz-filter: invert(1);
            -ms-filter: invert(1);
            -o-filter: invert(1);
          }

          .no-drag {
            user-drag: none;
            -webkit-user-drag: none;
            -moz-user-drag: none;
            -ms-user-drag: none;
            -o-user-drag: none;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            -o-user-select: none;
          }

          .center {
            transform: translate(-50%, -50%);
            top: 50%;
            left: 50%;
            width: 100%;
            text-align: center;
          }

          input {
            outline: none !important;
            border: none;
            padding-block: 0;
            padding-inline: 0;
          }
          input::file-selector-button {
            outline: none !important;
            border: none;
          }

          .hide {
            display: none !important;
          }
          /*

          placeholder

          */

          ::placeholder {
            color: black;
            opacity: 1;
            /* Firefox */
            background: none;
          }

          :-ms-input-placeholder {
            /* Internet Explorer 10-11 */
            color: black;
            background: none;
          }

          ::-ms-input-placeholder {
            /* Microsoft Edge */
            color: black;
            background: none;
          }

          /*

          selection

          */

          ::-moz-selection {
            /* Code for Firefox */
            color: black;
            background: rgb(208, 208, 208);
          }

          ::selection {
            color: black;
            background: rgb(208, 208, 208);
          }

          .lowercase {
            text-transform: lowercase;
          }
          .uppercase {
            text-transform: uppercase;
          }
          .capitalize {
            text-transform: capitalize;
          }

          .bold {
            font-weight: bold;
          }

          /*

          scrollbar

          Hide scrollbar for Chrome, Safari and Opera
          [TAG]::-webkit-scrollbar {
          display: none;
          }
          Hide scrollbar for IE, Edge and Firefox
          [TAG] {
          -ms-overflow-style: none;
          scrollbar-width: none;
          }

          */

          ::-webkit-scrollbar {
            width: 10px;
          }

          /* Track */
          ::-webkit-scrollbar-track {
            background: #f1f1f1;
          }

          /* Handle */
          ::-webkit-scrollbar-thumb {
            background: #888;
          }

          /* Handle on hover */
          ::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
        </style>
        <div class="session">
          <style>
            .session-in-log-out {
              display: block;
            }
            .session-inl-log-out {
              display: inline-table;
            }
            .session-in-log-in {
              display: none;
            }
            .session-inl-log-in {
              display: none;
            }
          </style>
        </div>
        <div class="theme"></div>
      `,
    );
    return await Themes[theme](options);
  },
  RenderSetting: async function () {
    return html` <div class="in section-mp">
      ${await DropDown.Render({
        value: Css.currentTheme,
        label: html`${Translate.Render('theme')}`,
        data: ThemesScope.map((themeOption) => {
          return {
            display: html`<i class="fa-solid fa-brush"></i> ${themeOption.theme}`,
            value: themeOption.theme,
            onClick: async () => await Themes[themeOption.theme](),
          };
        }),
      })}
    </div>`;
  },
};

const barLabels = (options) => {
  return {
    img: {
      close: html`<img
        class="inl bar-default-modal-icon ${options.iconClass ? options.iconClass : ''}"
        src="${getProxyPath()}assets/icons/close.png"
      />`,
      maximize: html`<img
        class="inl bar-default-modal-icon ${options.iconClass ? options.iconClass : ''}"
        src="${getProxyPath()}assets/icons/maximize.png"
      />`,
      minimize: html`<img
        class="inl bar-default-modal-icon ${options.iconClass ? options.iconClass : ''}"
        src="${getProxyPath()}assets/icons/minimize.png"
      />`,
      restore: html`<img
        class="inl bar-default-modal-icon ${options.iconClass ? options.iconClass : ''}"
        src="${getProxyPath()}assets/icons/restore.png"
      />`,
      menu: html`<img
        class="inl bar-default-modal-icon ${options.iconClass ? options.iconClass : ''}"
        src="${getProxyPath()}assets/icons/menu.png"
      />`,
    },
    fontawesome: {
      close: html`<i class="fa-solid fa-xmark ${options.iconClass ? options.iconClass : ''}"></i>`,
      maximize: html`<i class="fa-regular fa-square ${options.iconClass ? options.iconClass : ''}"></i>`,
      minimize: html`<i class="fa-solid fa-window-minimize ${options.iconClass ? options.iconClass : ''}"></i>`,
      restore: html`<i class="fa-regular fa-window-restore ${options.iconClass ? options.iconClass : ''}"></i>`,
      menu: html`<i class="fa-solid fa-bars ${options.iconClass ? options.iconClass : ''}"></i>`,
    },
    default: {
      close: html`X`,
      maximize: html`▢`,
      minimize: html`_`,
      restore: html`□`,
      menu: html`≡`,
    },
  };
};

const barConfig = (options) => {
  const { barButtonsIconTheme } = options;
  return {
    buttons: {
      close: {
        disabled: false,
        label: barLabels(options)[barButtonsIconTheme].close,
      },
      maximize: {
        disabled: false,
        label: barLabels(options)[barButtonsIconTheme].maximize,
      },
      minimize: {
        disabled: false,
        label: barLabels(options)[barButtonsIconTheme].minimize,
      },
      restore: {
        disabled: false,
        label: barLabels(options)[barButtonsIconTheme].restore,
      },
      menu: {
        disabled: true,
        label: barLabels(options)[barButtonsIconTheme].menu,
      },
    },
  };
};

const renderDefaultWindowsModalButtonContent = (options) => {
  const { barButtonsIconTheme, htmlRender } = options;
  const barConfigInstance = barConfig(options);
  if (htmlRender)
    Object.keys(Modal.Data).map((idModal) => {
      if (s(`.btn-minimize-${idModal}`)) htmls(`.btn-minimize-${idModal}`, barConfigInstance.buttons.minimize.label);
      if (s(`.btn-restore-${idModal}`)) htmls(`.btn-restore-${idModal}`, barConfigInstance.buttons.restore.label);
      if (s(`.btn-maximize-${idModal}`)) htmls(`.btn-maximize-${idModal}`, barConfigInstance.buttons.maximize.label);
      if (s(`.btn-close-${idModal}`)) htmls(`.btn-close-${idModal}`, barConfigInstance.buttons.close.label);
      if (s(`.btn-menu-${idModal}`)) htmls(`.btn-menu-${idModal}`, barConfigInstance.buttons.menu.label);
    });
  return { barConfig: barConfigInstance };
};

let darkTheme = true;
const ThemeEvents = {};
const TriggerThemeEvents = () => {
  localStorage.setItem('theme', Css.currentTheme);
  Object.keys(ThemeEvents).map((keyEvent) => ThemeEvents[keyEvent]());
};

const Themes = {};

const addTheme = (options) => {
  ThemesScope.push(options);
  Themes[options.theme] = async (barOptions) => {
    if (!options.dark) options.dark = false;
    if (!options.barButtonsIconTheme) options.barButtonsIconTheme = 'fontawesome';
    const htmlRender = Css.currentTheme !== options.theme;
    if (htmlRender) {
      Css.currentTheme = options.theme;
      darkTheme = options.dark;
      let render = '';
      if (!['core', 'css-core'].includes(options.theme))
        render += darkTheme ? await CssCoreDark.render() : await CssCoreLight.render();
      render += await options.render();
      htmls('.theme', render);
      TriggerThemeEvents();
    }
    return {
      ...renderDefaultWindowsModalButtonContent({
        barButtonsIconTheme: options.barButtonsIconTheme,
        htmlRender,
        ...barOptions,
      }),
    };
  };
};

const borderChar = (px, color, selectors) => {
  if (selectors) {
    return selectors
      .map(
        (selector) => html`
          <style>
            ${selector} {
              text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color},
                -${px}px -${px}px ${px}px ${color}, ${px}px ${px}px ${px}px ${color};
            }
          </style>
        `,
      )
      .join('');
  }
  return html`
    text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color}, -${px}px -${px}px ${px}px
    ${color}, ${px}px ${px}px ${px}px ${color};
  `;
};

const boxShadow = ({ selector }) => html`
  <style>
    ${selector} {
      box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
    }
    ${selector}:hover {
      box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3);
    }
  </style>
`;

const renderMediaQuery = (mediaData) => {
  //  first limit should be '0'
  return html`
    ${mediaData
      .map(
        (mediaState) => html`
          <style>
            @media only screen and (min-width: ${mediaState.limit}px) {
              ${mediaState.css}
            }
          </style>
        `,
      )
      .join('')}
  `;
};

const renderStatus = (status, options) => {
  switch (status) {
    case 'success':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: green" class="fa-solid fa-check"></i>
      </div>`;
    case 'error':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: red" class="fa-solid fa-xmark"></i>
      </div>`;
    case 'warning':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: yellow" class="fa-solid fa-triangle-exclamation"></i>
      </div>`;
    default:
      return html``;
  }
};

const dynamicColTokens = {};

const dynamicCol = (options = { containerSelector: '', id: '', type: '', limit: 900 }) => {
  const { containerSelector, id } = options;
  const limitCol = options?.limit ? options.limit : 900;
  if (!(id in dynamicColTokens)) dynamicColTokens[id] = {};
  dynamicColTokens[id].options = options;
  if (dynamicColTokens[id].observer) dynamicColTokens[id].observer.disconnect();
  setTimeout(() => {
    dynamicColTokens[id].observer = new ResizeObserver(() => {
      if (s(`.${containerSelector}`)) {
        switch (options.type) {
          case 'a-50-b-50':
            if (s(`.${containerSelector}`).offsetWidth < limitCol)
              htmls(
                `.style-${id}-col`,
                css`
                  .${id}-col-a, .${id}-col-b {
                    width: 100%;
                  }
                `,
              );
            else
              htmls(
                `.style-${id}-col`,
                css`
                  .${id}-col-a {
                    width: 50%;
                  }
                  .${id}-col-b {
                    width: 50%;
                  }
                `,
              );
            break;

          default:
            if (s(`.${containerSelector}`).offsetWidth < 900)
              htmls(
                `.style-${id}-col`,
                css`
                  .${id}-col-a, .${id}-col-b {
                    width: 100%;
                  }
                `,
              );
            else
              htmls(
                `.style-${id}-col`,
                css`
                  .${id}-col-a {
                    width: 30%;
                  }
                  .${id}-col-b {
                    width: 70%;
                  }
                `,
              );
            break;
        }
      } else {
        dynamicColTokens[id].observer.disconnect();
        delete dynamicColTokens[id];
        if (s(`.style-${id}-col`)) s(`.style-${id}-col`).remove();
      }
    });
    dynamicColTokens[id].observer.observe(s(`.${containerSelector}`));
  });
  return html` <style class="style-${id}-col"></style>`;
};

const renderBubbleDialog = async function (options = { id: '', html: async () => '' }) {
  const { id, html } = options;
  return html`<div class="inl bubble-dialog-${id}">${await html()}</div>`;
};

const typeWriter = async function ({ id, html }) {
  // https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timing-function
  // https://www.w3schools.com/cssref/css3_pr_animation-fill-mode.php
  const typingAnimationTransitionStyle = [`1s linear`, `2s steps(30, end)`, `1s forwards`];
  return html`
    <style>
      .tw-${id}-container {
      }
      .tw-${id}-typed-out {
        overflow: hidden;
        border-right: 0.15em solid orange;
        white-space: nowrap;
        animation: typing-${id} ${typingAnimationTransitionStyle[1]}, blink-caret-${id} 0.5s step-end infinite;
        animation-fill-mode: forwards;
        width: 0;
      }
      @keyframes typing-${id} {
        from {
          width: 0;
        }
        to {
          width: 100%;
        }
      }

      @keyframes blink-caret-${id} {
        from,
        to {
          border-color: transparent;
        }
        50% {
          border-color: orange;
        }
      }
    </style>
    <div class="inl tw-${id}-container">
      <div class="tw-${id}-typed-out">${html}</div>
    </div>
  `;
};

const getStyleAttrFromObject = (selector, options) =>
  html`<style>
    ${selector} { ${options && options.style
      ? Object.keys(options.style)
          .map((keyStyle) => `${keyStyle}: ${options.style[keyStyle]};`)
          .join('')
      : ''} }
  </style>`;

function getTranslate3d(el) {
  const values = el.style.transform.split(/\w+\(|\);?/);
  if (!values[1] || !values[1].length) {
    return [];
  }
  return values[1].split(/,\s?/g);
}

const dashRange = ({ selector, color }) => {
  return html`
    <style>
      .${selector} {
        background: linear-gradient(90deg, ${color} 50%, transparent 50%),
          linear-gradient(90deg, ${color} 50%, transparent 50%), linear-gradient(0deg, ${color} 50%, transparent 50%),
          linear-gradient(0deg, ${color} 50%, transparent 50%);
        background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
        background-size: 16px 4px, 16px 4px, 4px 16px, 4px 16px;
        background-position: 0% 0%, 100% 100%, 0% 100%, 100% 0px;
        border-radius: 5px;
        padding: 10px;
        animation: ${selector}_dash_range 5s linear infinite;
      }

      @keyframes ${selector}_dash_range {
        to {
          background-position: 100% 0%, 0% 100%, 0% 0%, 100% 100%;
        }
      }
    </style>
  `;
};

export {
  Css,
  Themes,
  barLabels,
  barConfig,
  borderChar,
  renderMediaQuery,
  renderDefaultWindowsModalButtonContent,
  renderStatus,
  dynamicCol,
  dynamicColTokens,
  boxShadow,
  addTheme,
  darkTheme,
  ThemeEvents,
  TriggerThemeEvents,
  ThemesScope,
  renderBubbleDialog,
  typeWriter,
  getStyleAttrFromObject,
  getTranslate3d,
  dashRange,
};
