import { BtnIcon } from './BtnIcon.js';
import { s4 } from './CommonJs.js';
import { darkTheme, renderCssAttr, subThemeManager } from './Css.js';
import { loggerFactory } from './Logger.js';
import { append, htmls, s } from './VanillaJs.js';
import { getProxyPath } from './Router.js';

const logger = loggerFactory(import.meta);

const LoadingAnimation = {
  bar: {
    tokens: {},
    getId: (id) => `bar-progress-${id.slice(1)}`,
    play: async function (container) {
      const id = this.getId(container);
      const idEvent = s4() + s4() + s4();
      this.tokens[container] = `${idEvent}`;
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
          if (this.tokens[container] === idEvent && s(`.${id}`)) {
            s(`.${id}`).style.left = `-${frame.value}%`;
            // const percentageRender = html`${100 - frame.value}%`;
          }
        }, frame.time);
    },
    stop: function (container) {
      const id = this.getId(container);
      delete this.tokens[container];
      if (!s(`.${id}`)) return;
      s(`.${id}`).style.left = '0%';
      s(`.${id}`).style.opacity = 1;
      setTimeout(() => (s(`.${id}`).style.opacity = 0));
      setTimeout(() => s(`.${id}`).remove(), 400);
    },
  },
  spinner: {
    getId: (id) => `spinner-progress-${id.slice(1)}`,
    play: async function (container, spinner) {
      if (!s(container)) return;
      const id = this.getId(container);

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
            ${render}
          </div>
        `,
      );
      const label = BtnIcon.findLabel(s(container));
      if (label) label.classList.add('hide');
    },
    stop: function (container) {
      const id = this.getId(container);
      if (!s(`.${id}`)) return;
      s(`.${id}`).remove();
      const label = BtnIcon.findLabel(s(container));
      if (label) label.classList.remove('hide');
    },
  },
  img: {
    tokens: {},
    load: function ({ key, src, classes, style }) {
      this.tokens[key] = { src, classes, style };
    },
    play: function (container, key) {
      append(
        container,
        html`<img
          ${this.tokens[key].classes ? `class="${this.tokens[key].classes}"` : ''}
          ${this.tokens[key].style ? `style="${this.tokens[key].style}"` : ''}
          src="${getProxyPath()}${this.tokens[key].src}"
        />`,
      );
    },
  },
  barLevel: {
    append: () => {
      if (Array.from(sa('.ssr-loading-bar-block')).length >= 5) return;
      s(`.ssr-blink-bar`).classList.remove('ssr-blink-bar');
      append('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
    clear: () => {
      htmls('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
  },
  removeSplashScreen: function (backgroundContainer, callBack) {
    if (s(`.clean-cache-container`)) s(`.clean-cache-container`).style.display = 'none';
    if (!backgroundContainer) backgroundContainer = '.ssr-background';
    if (s(backgroundContainer))
      setTimeout(() => {
        s(backgroundContainer).style.opacity = 0;
        setTimeout(async () => {
          s(backgroundContainer).style.display = 'none';
          if (s(`.modal-menu`)) s(`.modal-menu`).classList.remove('hide');
          if (s(`.main-body-btn-container`)) s(`.main-body-btn-container`).classList.remove('hide');
          if (callBack) callBack();
        }, 300);
      });
  },

  RenderCurrentSrcLoad: function (event) {
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
  },
};
export { LoadingAnimation };
