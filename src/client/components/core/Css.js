import { getId, newInstance, range, rgbToHex, s4, splitEveryXChar } from './CommonJs.js';
import { CssCoreDark, CssCoreLight } from './CssCore.js';
import { DropDown } from './DropDown.js';
import { Modal } from './Modal.js';
import { Translate } from './Translate.js';
import { append, getProxyPath, htmls, s, sa } from './VanillaJs.js';

let ThemesScope = [];

// https://css.github.io/csso/csso.html
// https://www.fontspace.com/
// https://www.1001fonts.com/

const Css = {
  // Menu button container transition styles
  menuButtonContainer: () => css`
    .main-btn-menu {
      transition: all 0.2s ease-in-out;
      position: relative;
    }

    .main-btn-menu::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 0;
      height: 2px;
      background: currentColor;
      transition: all 0.2s ease-in-out;
      transform: translateX(-50%);
    }

    .main-btn-menu:hover::after {
      width: 60%;
    }

    .main-btn-menu.active {
      background: rgba(255, 255, 255, 0.1);
    }

    .main-btn-menu.active::after {
      width: 80%;
      background: currentColor;
    }
  `,

  loadThemes: async function (themes = []) {
    ThemesScope = [];
    for (const themeOptions of themes) addTheme(themeOptions);
    // if (!ThemesScope.find((t) => t.dark)) addTheme(CssCoreDark);
    // if (!ThemesScope.find((t) => !t.dark)) addTheme(CssCoreLight);
    if (ThemesScope.length === 0) {
      addTheme(CssCoreLight);
      addTheme(CssCoreDark);
    }
    const localStorageTheme = localStorage.getItem('_theme');
    if (localStorageTheme && Themes[localStorageTheme]) {
      const themeOption = ThemesScope.find((t) => t.theme === localStorageTheme);
      if (themeOption) return await this.Init(themeOption);
    }
    await this.Init();
  },
  Init: async function (options) {
    if (!options) options = ThemesScope[0];
    const { theme } = options;

    // Inject menu button container styles
    const styleId = 'menu-btn-container-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = this.menuButtonContainer();
      document.head.appendChild(style);
    }

    return await Themes[theme](options);
  },
  RenderSetting: async function () {
    return html` <div class="in section-mp">
      ${await DropDown.Render({
        id: 'settings-theme',
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
  localStorage.setItem('_theme', Css.currentTheme);
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
      render += await subThemeManager.render();
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

const borderChar = (px, color, selectors, hover = false) => {
  if (selectors) {
    return selectors
      .map(
        (selector) => html`
          <style>
            ${selector}${hover ? ':hover' : ''} {
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
  ${darkTheme
    ? html`
        <style>
          ${selector} {
            box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.1), 0 6px 20px 0 rgba(255, 255, 255, 0.08);
          }
          ${selector}:hover {
            box-shadow: 0 8px 16px 0 rgba(255, 255, 255, 0.15), 0 10px 30px 0 rgba(255, 255, 255, 0.1);
          }
        </style>
      `
    : html`
        <style>
          ${selector} {
            box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
          }
          ${selector}:hover {
            box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3);
          }
        </style>
      `}
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

const renderBubbleDialog = async function (
  options = {
    id: '',
    html: async () => '',
    classSelectors,
    triangleType: 'down',
    trianglePositionCss: '',
    triangleCss: '',
    triangleDim: 0,
    bubbleCss: '',
  },
) {
  const { id, html } = options;
  let cssTrianglePosition = `
    bottom: -45px;
    left: 5px;
  `;
  let whiteTriangleStyle = `top: 43%`;
  let blackTriangleStyle = ``;
  switch (options.triangleType) {
    case 'right':
      cssTrianglePosition = `
        right: -40px;
        top: 5px;
      `;
      blackTriangleStyle = `
        top: 43%;
        left: 57%;
      `;
      break;

    default:
      break;
  }
  if (options.trianglePositionCss) cssTrianglePosition = options.trianglePositionCss;
  return html` <div
    class="${options?.classSelectors ? options.classSelectors : 'inl'} bubble-dialog bubble-dialog-${id}"
    ${options.bubbleCss ? `style='${options.bubbleCss}'` : ''}
  >
    <style class="style-bubble-dialog-triangle-${id}">
      .bubble-dialog-triangle-${id} {
        width: ${options.triangleDim ? options.triangleDim : 60}px;
        height: ${options.triangleDim ? options.triangleDim : 60}px;
        /* border: 2px solid red; */
        box-sizing: border-box;
        ${cssTrianglePosition}
      }
    </style>
    <div class="abs bubble-dialog-triangle bubble-dialog-triangle-${id}">
      <div class="abs center" style="${blackTriangleStyle}">
        ${triangle[options?.triangleType ? options.triangleType : 'down']({
          dim: 25,
          id: id + '-triangle-black',
          color: 'black',
          classList: 'inl',
          customStyle: options.triangleCss,
        })}
      </div>
      <div class="abs center" style="${whiteTriangleStyle}">
        ${triangle[options?.triangleType ? options.triangleType : 'down']({
          dim: 24,
          id: id + '-triangle-white',
          color: 'white',
          classList: 'inl',
          customStyle: options.triangleCss,
        })}
      </div>
    </div>
    ${await html()}
  </div>`;
};

const typeWriter = async function ({ id, html, seconds, endHideBlink, container }) {
  if (!seconds) seconds = 2;
  return new Promise((resolve) => {
    // https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timing-function
    // https://www.w3schools.com/cssref/css3_pr_animation-fill-mode.php
    const typingAnimationTransitionStyle = [
      `1s linear`,
      `${seconds}s steps(${html.split(' ').length * 6}, end)`,
      `1s forwards`,
    ];
    const render = html`
      <style class="style-${id}">
        .tw-${id}-typed-out {
          overflow: hidden;
          border-right: 0.15em solid orange;
          white-space: nowrap;
          animation: typing-${id} ${typingAnimationTransitionStyle[1]}, blink-caret-${id} 0.5s step-end infinite;
          animation-fill-mode: forwards;
          width: 0;
        }
      </style>
      <style>
        .tw-${id}-container {
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
    htmls(`.${container}`, render);
    setTimeout(() => {
      if (endHideBlink && s(`.style-${id}`)) s(`.style-${id}`).remove();
      resolve(render);
    }, seconds * 1000);
  });
};

const renderCssAttr = (options) =>
  `${
    options && options.style
      ? Object.keys(options.style)
          .map((keyStyle) => `${keyStyle}: ${options.style[keyStyle]};`)
          .join(`\n`)
      : ''
  }`;

const renderStyleTag = (styleSelector = 'style-abc', selector, options) =>
  html`<style class="${styleSelector}">
    ${selector} { ${renderCssAttr(options)} }
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
const triangle = {
  up: ({ id, dim, color, classList, customStyle }) => {
    return html`<style class="style-${id}">
        .arrow-up-${id} {
          width: 0;
          height: 0;
          border-left: ${dim}px solid transparent;
          border-right: ${dim}px solid transparent;
          border-bottom: ${dim}px solid ${color};
        }
      </style>
      <div
        class="arrow-up-${id} ${classList}"
        ${customStyle ? `style="${customStyle ? customStyle : ''}"` : ''}
      ></div>`;
  },
  down: ({ id, dim, color, classList, customStyle }) => {
    return html`<style class="style-${id}">
        .arrow-down-${id} {
          width: 0;
          height: 0;
          border-left: ${dim}px solid transparent;
          border-right: ${dim}px solid transparent;
          border-top: ${dim}px solid ${color};
        }
      </style>
      <div
        class="arrow-down-${id} ${classList}"
        ${customStyle ? `style="${customStyle ? customStyle : ''}"` : ''}
      ></div>`;
  },
  right: ({ id, dim, color, classList, customStyle }) => {
    return html` <style class="style-${id}">
        .arrow-right-${id} {
          width: 0;
          height: 0;
          border-top: ${dim}px solid transparent;
          border-bottom: ${dim}px solid transparent;
          border-left: ${dim}px solid ${color};
        }
      </style>
      <div
        class="arrow-right-${id} ${classList}"
        ${customStyle ? `style="${customStyle ? customStyle : ''}"` : ''}
      ></div>`;
  },
  left: ({ id, dim, color, classList, customStyle }) => {
    return html`<style class="style-${id}">
        .arrow-left-${id} {
          width: 0;
          height: 0;
          border-top: ${dim}px solid transparent;
          border-bottom: ${dim}px solid transparent;
          border-right: ${dim}px solid ${color};
        }
      </style>
      <div
        class="arrow-left-${id} ${classList}"
        ${customStyle ? `style="${customStyle ? customStyle : ''}"` : ''}
      ></div>`;
  },
};

const getSectionsStringData = (offsetWidth, text) => {
  const sectionsIndex = [];
  const everyXChar = parseInt(offsetWidth / 4);
  const phraseArray = text
    .split('.')
    .map((t) => splitEveryXChar(t + '.', everyXChar, ['.', ' ']))
    .flat()
    .filter((p) => p !== '.' && p.trim());

  let currentIndex = [0];
  let pi = -1;
  for (const p of phraseArray) {
    pi++;
    if (p.indexOf('.') !== -1) {
      currentIndex.push(newInstance(pi));
      sectionsIndex.push(newInstance(currentIndex));
      if (phraseArray[pi + 1]) currentIndex = [newInstance(pi + 1)];
      else currentIndex = [];
    }
  }
  if (currentIndex[0] && !currentIndex[1]) {
    currentIndex[1] = phraseArray.length - 1;
    sectionsIndex.push(newInstance(currentIndex));
  }
  return { phraseArray, sectionsIndex };
};

const typeWriteSectionsString = ({ container, phraseArray, rangeArraySectionIndex }) =>
  new Promise((resolve) => {
    let cumulativeSeconds = 0;
    for (const index of range(...rangeArraySectionIndex)) {
      const subIdSalt = s4() + s4() + s4();
      const seconds = phraseArray[index].trim().length * 0.05;
      append(`.${container}`, html` <div class="${container}-${subIdSalt}"></div> `);
      setTimeout(async () => {
        if (s(`.${container}-${subIdSalt}`)) {
          append(`.${container}-${subIdSalt}`, html` <div class="render-typeWriter-${container}-${subIdSalt}"></div> `);
          await typeWriter({
            id: `typeWriter-${index}-${container}`,
            html: phraseArray[index].trim(),
            endHideBlink: index < rangeArraySectionIndex[1],
            seconds,
            container: `render-typeWriter-${container}-${subIdSalt}`,
          });
        }
        if (index === rangeArraySectionIndex[1]) resolve();
      }, cumulativeSeconds * 1000);
      cumulativeSeconds += seconds;
    }
  });

const cssBrowserCodes = ['webkit', 'moz', 'ms', 'o'];

const scrollBarLightRender = () => {
  return cssBrowserCodes
    .map(
      (b) =>
        html`<style>
        ::-` +
        b +
        `-scrollbar {
          width: 5px;      
          height: 5px; 
        }

        /* Track */
        ::-` +
        b +
        `-scrollbar-track {
          background: none !important;
        }

        /* Handle */
        ::-` +
        b +
        `-scrollbar-thumb {
          background: #15151557;
          border-radius: 3px;
        }

        /* Handle on hover */
        ::-` +
        b +
        `-scrollbar-thumb:hover {
          background: #4d4d4dbb;
        }
      </style>`,
    )
    .join('');
};

/**
 * Adjust hex color brightness toward white/black ("mix") or by modifying HSL lightness ("hsl").
 *
 * @param {string} hex - Color as '#rrggbb', 'rrggbb', '#rgb', or 'rgb'.
 * @param {number} factor - -1..1 or -100..100 (percent). Positive = lighten, negative = darken.
 * @param {{mode?: 'mix'|'hsl'}} [options]
 * @returns {string} - Adjusted color as '#rrggbb' (lowercase).
 */
function adjustHex(hex, factor = 0.1, options = {}) {
  if (typeof hex !== 'string') throw new TypeError('hex must be a string');
  if (typeof factor !== 'number') throw new TypeError('factor must be a number');

  // normalize factor: allow -100..100 or -1..1
  if (factor > 1 && factor <= 100) factor = factor / 100;
  if (factor < -1 && factor >= -100) factor = factor / 100;
  factor = Math.max(-1, Math.min(1, factor));

  const mode = options.mode === 'hsl' ? 'hsl' : 'mix';

  // normalize hex
  let h = hex.replace(/^#/, '').trim();
  if (!(h.length === 3 || h.length === 6)) throw new Error('Invalid hex format');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  const clamp = (v, a = 0, z = 255) => Math.max(a, Math.min(z, v));

  const rgbToHex = (rr, gg, bb) =>
    '#' +
    [rr, gg, bb]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

  if (mode === 'mix') {
    // positive: mix toward white (255); negative: mix toward black (0)
    const mixChannel = (c) => {
      if (factor >= 0) {
        return clamp(Math.round(c + (255 - c) * factor));
      } else {
        const a = Math.abs(factor);
        return clamp(Math.round(c * (1 - a)));
      }
    };
    return rgbToHex(mixChannel(r), mixChannel(g), mixChannel(b));
  } else {
    // HSL mode: convert rgb to hsl, adjust L by factor, convert back
    const rgbToHsl = (r, g, b) => {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      let h = 0,
        s = 0,
        l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h /= 6;
      }
      return { h, s, l };
    };

    const hslToRgb = (h, s, l) => {
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return { r: r * 255, g: g * 255, b: b * 255 };
    };

    const { h: hh, s: ss, l: ll } = rgbToHsl(r, g, b);
    // add factor to lightness (factor already normalized -1..1)
    let newL = ll + factor;
    newL = Math.max(0, Math.min(1, newL));
    const { r: r2, g: g2, b: b2 } = hslToRgb(hh, ss, newL);
    return rgbToHex(r2, g2, b2);
  }
}

// Convenience helpers:
function lightenHex(hex, percentOr01 = 0.1, options = {}) {
  return adjustHex(hex, Math.abs(percentOr01), options);
}
function darkenHex(hex, percentOr01 = 0.1, options = {}) {
  return adjustHex(hex, -Math.abs(percentOr01), options);
}

const subThemeManager = {
  render: async function () {
    if (darkTheme && this.renderDark) {
      return await this.renderDark();
    } else if (!darkTheme && this.renderLight) {
      return await this.renderLight();
    }
    return html``;
  },
  lightColor: null,
  setLightTheme: function (color) {
    this.lightColor = color;
    this.renderLight = async function () {
      return html`<style>
        button:hover,
        .a-btn:hover,
        .main-btn-menu-active {
          color: ${this.lightColor};
          background-color: ${lightenHex(this.lightColor, 0.8)};
        }
      </style>`;
    };
  },
  darkColor: null,
  setDarkTheme: function (color) {
    this.darkColor = color;
    this.renderDark = async function () {
      return html`<style>
        button:hover,
        .a-btn:hover,
        .main-btn-menu-active {
          color: ${lightenHex(this.darkColor, 0.8)};
          background-color: ${darkenHex(this.darkColor, 0.75)};
        }
      </style>`;
    };
  },
};

const scrollBarDarkRender = () => {
  return cssBrowserCodes
    .map(
      (b) =>
        html`<style>
    ::-` +
        b +
        `-scrollbar {
      width: 8px;
      height: 8px; 
      /* line-height: 1em; */
    }

    /* Track */
    ::-` +
        b +
        `-scrollbar-track {
      background: none !important;
    }

    /* Handle */
    ::-` +
        b +
        `-scrollbar-thumb {
      background: #74747457;
      border-radius: 4px;
    }

    /* Handle on hover */
    ::-` +
        b +
        `-scrollbar-thumb:hover {
      background: #98989857;
    }
  </style>`,
    )
    .join('');
};

const renderWave = ({ id }) => {
  return html`
    <style>
      .wave-animation-container-${id} {
        height: 200px;
      }
      .wave-animation-container-${id} {
        background: linear-gradient(
          315deg,
          rgba(101, 0, 94, 1) 3%,
          rgba(60, 132, 206, 1) 38%,
          rgba(48, 238, 226, 1) 68%,
          rgba(255, 25, 25, 1) 98%
        );
        animation: gradient-${id} 15s ease infinite;
        background-size: 400% 400%;
        overflow: hidden;
      }

      @keyframes gradient-${id} {
        0% {
          background-position: 0% 0%;
        }
        50% {
          background-position: 100% 100%;
        }
        100% {
          background-position: 0% 0%;
        }
      }

      .wave-${id} {
        background: rgb(255 255 255 / 25%);
        border-radius: 1000% 1000% 0 0;
        width: 200%;
        height: 12em;
        animation: wave-${id} 10s -3s linear infinite;
        opacity: 0.8;
        bottom: 0;
        left: 0;
        top: 30%;
      }

      .wave-${id}:nth-of-type(2) {
        animation: wave-${id} 18s linear reverse infinite;
        opacity: 0.8;
        top: 50%;
      }

      .wave-${id}:nth-of-type(3) {
        animation: wave-${id} 20s -1s reverse infinite;
        opacity: 0.9;
        top: 70%;
      }

      @keyframes wave-${id} {
        2% {
          transform: translateX(1);
        }

        25% {
          transform: translateX(-25%);
        }

        50% {
          transform: translateX(-50%);
        }

        75% {
          transform: translateX(-25%);
        }

        100% {
          transform: translateX(1);
        }
      }
    </style>
    <div class="in wave-animation-container-${id} ${id}">
      <div class="in wave-${id}"></div>
      <div class="abs wave-${id}"></div>
      <div class="abs wave-${id}"></div>
    </div>
  `;
};

const cssTokensEffect = {};
const cssTokensContainer = {};
const cssEffect = async (containerSelector, event) => {
  // Array.from(event.target.classList)
  let offsetX, offsetY;
  if (Array.from(event.srcElement.classList).includes('ripple') && cssTokensContainer[containerSelector]) {
    offsetX = cssTokensContainer[containerSelector].lastOffsetX;
    offsetY = cssTokensContainer[containerSelector].lastOffsetY;
  } else {
    cssTokensContainer[containerSelector] = { lastOffsetX: event.offsetX, lastOffsetY: event.offsetY };
    offsetX = event.offsetX;
    offsetY = event.offsetY;
  }
  const element = s(containerSelector);
  // element.style.overflow = 'hidden';
  const id = getId(cssTokensEffect, 'btn-effect-');
  cssTokensEffect[id] = { containerSelector, event };
  append(containerSelector, html`<span class="abs ${id} ripple" style="display: none"></span>`);
  const circle = s(`.${id}`);
  circle.style.width = circle.style.height = `40px`;
  circle.style.left = `${offsetX}px`;
  circle.style.top = `${offsetY}px`;
  circle.style.display = null;
  setTimeout(() => {
    circle.remove();
    delete cssTokensEffect[id];
  }, 600);
};

const imageShimmer = () => html`<div
  class="abs center ssr-shimmer-search-box"
  style="${renderCssAttr({
    style: {
      width: '95%',
      height: '95%',
      'border-radius': '10px',
      overflow: 'hidden',
    },
  })}"
>
  <div
    class="abs center"
    style="${renderCssAttr({
      style: {
        'font-size': '70px',
        color: `#bababa`,
      },
    })}"
  >
    <i class="fa-solid fa-photo-film"></i>
  </div>
</div>`;

const renderChessPattern = () => `background: repeating-conic-gradient(#808080 0 25%, #0000 0 50%) 50% / 20px 20px`;

const extractBackgroundImageUrl = (element) => {
  const style = window.getComputedStyle(element);
  const imageString = style.backgroundImage;
  const foundUrlRaw = imageString.match(/^url\(?(.+)\)$/i)[1];
  if (!foundUrlRaw) return null;
  const foundUrl = foundUrlRaw.replace(/^['|"| ]*/, '').replace(/['" ]*$/, '');
  if (!foundUrl) return null;
  return foundUrl;
};

const simpleIconsRender = (selector) => {
  sa(selector).forEach((el) => {
    el.src = `https://cdn.simpleicons.org/coveralls/${rgbToHex(window.getComputedStyle(s('html')).color)}`;
  });
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
  renderStyleTag,
  renderCssAttr,
  getTranslate3d,
  dashRange,
  triangle,
  getSectionsStringData,
  typeWriteSectionsString,
  cssBrowserCodes,
  scrollBarDarkRender,
  scrollBarLightRender,
  renderWave,
  cssEffect,
  imageShimmer,
  simpleIconsRender,
  extractBackgroundImageUrl,
  renderChessPattern,
  subThemeManager,
  lightenHex,
  darkenHex,
  adjustHex,
};
