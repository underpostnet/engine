import { BtnIcon } from './BtnIcon.js';
import { s4 } from './CommonJs.js';
import { darkTheme, renderCssAttr, subThemeManager } from './Css.js';
import { loggerFactory } from './Logger.js';
import { append, htmls, s } from './VanillaJs.js';
import { getProxyPath } from './Router.js';
const logger = loggerFactory(import.meta);
class LoadingAnimation {
  static bar = {
    tokens: {},
    getId: (id) => `bar-progress-${id.slice(1)}`,
    play: async function (container) {
      const id = LoadingAnimation.bar.getId(container);
      const idEvent = s4() + s4() + s4();
      LoadingAnimation.bar.tokens[container] = `${idEvent}`;
      // diagonal-bar-background-animation
      // #6d68ff #790079
      append(
        'body',
        html`
          <div
            class="fix progress-bar box-shadow ${id}"
            style="left: -100%; background: ${darkTheme
              ? subThemeManager.darkColor
                ? subThemeManager.darkColor
                : `#66e400`
              : subThemeManager.lightColor
                ? subThemeManager.lightColor
                : `#157e00`};"
          ></div>
        `,
      );
      for (const frame of [
        { time: 500, value: 35 },
        { time: 1250, value: 15 },
        { time: 3000, value: 5 },
        { time: 5000, value: 1 },
      ])
        setTimeout(() => {
          if (LoadingAnimation.bar.tokens[container] === idEvent && s(`.${id}`)) {
            s(`.${id}`).style.left = `-${frame.value}%`;
            // const percentageRender = html`${100 - frame.value}%`;
          }
        }, frame.time);
    },
    stop: function (container) {
      const id = LoadingAnimation.bar.getId(container);
      delete LoadingAnimation.bar.tokens[container];
      if (!s(`.${id}`)) return;
      s(`.${id}`).style.left = '0%';
      s(`.${id}`).style.opacity = 1;
      setTimeout(() => (s(`.${id}`).style.opacity = 0));
      setTimeout(() => s(`.${id}`).remove(), 400);
    },
  };
  static spinner = {
    getId: (id) => `spinner-progress-${id.slice(1)}`,
    play: async function (container, spinner, options = { append: '', prepend: '' }) {
      if (!s(container)) return;
      const id = LoadingAnimation.spinner.getId(container);
      let render;
      switch (spinner) {
        case 'dual-ring':
          render = html`<div class="lds-dual-ring"></div>`;
          break;
        case 'dual-ring-mini':
        default:
          render = html`<div class="lds-dual-ring-mini"></div>`;
          break;
      }
      const style = {
        'text-align': 'center',
      };
      append(
        container,
        html`
          <div
            class="abs center ${id}"
            style="${renderCssAttr({
              style,
            })}"
          >
            ${options.prepend ? options.prepend : ''} ${render} ${options.append ? options.append : ''}
          </div>
        `,
      );
      const label = BtnIcon.findLabel(s(container));
      if (label) label.classList.add('hide');
    },
    stop: function (container) {
      const id = LoadingAnimation.spinner.getId(container);
      if (!s(`.${id}`)) return;
      s(`.${id}`).remove();
      const label = BtnIcon.findLabel(s(container));
      if (label) label.classList.remove('hide');
    },
  };
  static img = {
    tokens: {},
    load: function ({ key, src, classes, style }) {
      LoadingAnimation.tokens[key] = { src, classes, style };
    },
    play: function (container, key) {
      append(
        container,
        html`<img
          ${LoadingAnimation.tokens[key].classes ? `class="${LoadingAnimation.tokens[key].classes}"` : ''}
          ${LoadingAnimation.tokens[key].style ? `style="${LoadingAnimation.tokens[key].style}"` : ''}
          src="${getProxyPath()}${LoadingAnimation.tokens[key].src}"
        />`,
      );
    },
  };
  static barLevel = {
    append: () => {
      if (Array.from(sa('.ssr-loading-bar-block')).length >= 5) return;
      s(`.ssr-blink-bar`).classList.remove('ssr-blink-bar');
      append('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
    clear: () => {
      htmls('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
  };
  static removeSplashScreen(backgroundContainer, callBack) {
    if (s(`.clean-cache-container`)) s(`.clean-cache-container`).style.display = 'none';
    if (!backgroundContainer) backgroundContainer = '.ssr-background';
    if (s(backgroundContainer)) {
      s(backgroundContainer).style.display = 'none';
      if (callBack) callBack();
    }
  }
  static RenderCurrentSrcLoad(event) {
    if (s(`.ssr-loading-info`)) {
      let nameSrcLoad = event.data.path;
      if (nameSrcLoad) {
        if (nameSrcLoad.match('assets'))
          nameSrcLoad =
            location.hostname +
            location.pathname +
            (location.pathname[location.pathname.length - 1] !== '/' ? '/' : '') +
            'assets';
        else if (!nameSrcLoad.match('api')) nameSrcLoad = undefined;
        if (nameSrcLoad)
          htmls(
            `.ssr-loading-info`,
            html`<span style="color: white">Loading </span> ...${nameSrcLoad.slice(-30).replaceAll('file', 'storage')}`,
          );
      }
    }
  }
}
export { LoadingAnimation };
