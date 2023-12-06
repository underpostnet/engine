import { CoreService } from '../../services/core/core.service.js';
import { s4 } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { append, getProxyPath, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const LoadingAnimation = {
  bar: {
    tokens: {},
    getId: (id) => `bar-progress-${id.slice(1)}`,
    play: async function (container) {
      const id = this.getId(container);
      const idEvent = s4() + s4() + s4();
      this.tokens[container] = `${idEvent}`;
      append(
        'body',
        html` <div class="fix progress-bar diagonal-bar-background-animation ${id}" style="left: -100%"></div> `,
      );
      for (const frame of [
        { time: 500, value: '-35%' },
        { time: 1250, value: '-15%' },
      ])
        setTimeout(() => {
          if (this.tokens[container] === idEvent && s(`.${id}`)) s(`.${id}`).style.left = frame.value;
        }, frame.time);
    },
    stop: function (container) {
      const id = this.getId(container);
      delete this.tokens[container];
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
          html: await CoreService.getRaw(url),
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
    play: async function (container, spinner = 'spinner') {
      await this.spinnerSrcValidator(spinner);
      const id = this.getId(container);
      append(container, html` <div class="in ${id}" style="text-align: center">${this.spinners[spinner].html}</div> `);
    },
    stop: function (container) {
      const id = this.getId(container);
      s(`.${id}`).remove();
    },
  },
};
export { LoadingAnimation };
