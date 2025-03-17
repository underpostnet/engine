import { CoreService } from '../../services/core/core.service.js';
import { BtnIcon } from './BtnIcon.js';
import { s4 } from './CommonJs.js';
import { darkTheme, renderCssAttr } from './Css.js';
import { loggerFactory } from './Logger.js';
import { append, getAllChildNodes, getProxyPath, htmls, s, sa } from './VanillaJs.js';

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
              ? LoadingAnimation.darkColor
                ? LoadingAnimation.darkColor
                : `#c9c9c9`
              : LoadingAnimation.lightColor
              ? LoadingAnimation.lightColor
              : `#515151`};"
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

      if (s(container).classList) {
        const classes = Array.from(s(container).classList);
        if (classes.find((e) => e.match('management-table-btn-mini'))) {
          style.top = '-2px';
          style.left = '-2px';
        } else if (classes.find((e) => e.match('main-btn-')) && !classes.find((e) => e.match('main-btn-square-menu'))) {
          style.top = '-8px';
        } else if (classes.find((e) => e.match('action-bar-box'))) {
          style.top = '-30px';
          style.left = '-12px';
        }
      }

      append(
        container,
        html`
          <div
            class="in ${id}"
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
          if (callBack) callBack();
        }, 300);
      });
  },
  lightColor: null,
  setLightColor: function (color) {
    this.lightColor = color;
  },
  darkColor: null,
  setDarkColor: function (color) {
    this.darkColor = color;
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
