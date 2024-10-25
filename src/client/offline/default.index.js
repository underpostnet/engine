import {
  getLang,
  s,
  append,
  s4,
  range,
  timer,
  htmls,
  newInstance,
  fullScreenIn,
  borderChar,
  loggerFactory,
} from '../ssr/Lib.js';
/*imports*/

const lang = getLang().match('es') ? 'es' : 'en';

const logger = loggerFactory({ url: '/offline.js' });

const Translate = {
  ['server-maintenance']: {
    en: "The server is under maintenance <br> we'll be back soon.",
    es: 'El servidor está en mantenimiento <br> volveremos pronto.',
  },
};

const serverIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24">
  <path
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
    d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm9 13H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h10.5m-.5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0m2-3.5V16m0 4v1.5m3.032-5.25l-1.299.75m-3.463 2l-1.3.75m0-3.5l1.3.75m3.463 2l1.3.75M7 8v.01M7 16v.01"
  />
</svg>`;

window.onload = () => {
  window.serviceWorkerReady = true;
  append(
    'body',
    html`
      <style>
        body {
          background-color: #dcdcdc;
          color: #191919;
          font-family: arial;
          font-size: 16px;
        }
      </style>

      <div class="abs center" style="top: 40%">${serverIcon}<br /><br />${Translate['server-maintenance'][lang]}</div>
    `,
  );
};
