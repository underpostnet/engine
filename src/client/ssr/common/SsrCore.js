const s = (el) => document.querySelector(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const htmls = (el, html) => (s(el).innerHTML = html);

const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);

const range = (start, end) => {
  return end < start
    ? range(end, start).reverse()
    : Array.apply(0, Array(end - start + 1)).map((element, index) => index + start);
};

const timer = (ms) => new Promise((res) => setTimeout(res, ms));

const newInstance = (obj) => {
  // structuredClone() 2022 ES6 feature
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    return { error: error.message };
  }
};

const fullScreenIn = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    /* Chrome, Safari & Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    /* IE/Edge */
    elem = window.top.document.body; //To break out of frame in IE
    elem.msRequestFullscreen();
  }
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
const getLang = () =>
  localStorage.getItem('lang') ? localStorage.getItem('lang') : navigator.language || navigator.userLanguage;

const loggerFactory = (meta) => {
  meta = meta.url.split('/').pop();
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      if (location.hostname !== 'localhost' && console.log() !== null) {
        console.log = () => null;
        console.error = () => null;
        console.info = () => null;
        console.warn = () => null;
      }
      return location.hostname === 'localhost'
        ? console[type](`[${meta}] ${new Date().toISOString()} ${type}:`, ...args)
        : null;
    },
  };
  types.map(
    (type) =>
      (logger[type] = function (...args) {
        return this.log(type, args);
      }),
  );
  return logger;
};

export { getLang, s, append, s4, range, timer, htmls, newInstance, fullScreenIn, borderChar, loggerFactory };
