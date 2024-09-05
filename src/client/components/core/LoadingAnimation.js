import { CoreService } from '../../services/core/core.service.js';
import { s4 } from './CommonJs.js';
import { darkTheme } from './Css.js';
import { loggerFactory } from './Logger.js';
import { append, getProxyPath, htmls, s } from './VanillaJs.js';

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
    spinners: {},
    getId: (id) => `spinner-progress-${id.slice(1)}`,
    spinnerSrcValidator: async function (spinner) {
      if (!this.spinners[spinner]) {
        const url = getProxyPath() + 'dist/loadingio/' + spinner + '/index.html';
        this.spinners[spinner] = {
          url,
          html: await CoreService.getRaw({ url }),
        };
        append(
          'head',
          html`<link
            rel="stylesheet"
            type="text/css"
            href="${getProxyPath()}dist/loadingio/${spinner}/index.min.css"
          />`,
        );
      }
    },
    play: async function (container, spinner = 'dual-ring') {
      await this.spinnerSrcValidator(spinner);
      const id = this.getId(container);
      if (s(container))
        append(
          container,
          html` <div class="in ${id} loading-animation-container">${this.spinners[spinner].html}</div> `,
        );
    },
    stop: function (container) {
      const id = this.getId(container);
      if (!s(`.${id}`)) return;
      s(`.${id}`).remove();
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
      s(`.ssr-blink-bar`).classList.remove('ssr-blink-bar');
      append('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
    clear: () => {
      htmls('.ssr-loading-bar', html`<div class="ssr-loading-bar-block ssr-blink-bar"></div>`);
    },
  },
  removeSplashScreen: function () {
    if (s(`.clean-cache-container`)) s(`.clean-cache-container`).style.display = 'none';
    if (s('.ssr-background'))
      setTimeout(() => {
        s('.ssr-background').style.opacity = 0;
        setTimeout(async () => {
          s('.ssr-background').style.display = 'none';
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
            html`<span style="color: white">Download </span> <br />
              <br />
              ...${nameSrcLoad.slice(-30)}`,
          );
      }
    }
  },
};
export { LoadingAnimation };
