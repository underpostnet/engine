import { getCurrentTrace } from './CommonJs.js';

const DEV = window.renderPayload ? window.renderPayload.dev : false;

const loggerFactory = (meta, options = { trace: false }) => {
  meta = meta.url.split('/').pop();
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      if (!DEV && location.hostname !== 'localhost' && console.log() !== null) {
        console.log = () => null;
        console.error = () => null;
        console.info = () => null;
        console.warn = () => null;
      }
      if (options.trace === true) args.push(getCurrentTrace().split('Logger.js:23')[1]);
      return DEV || location.hostname === 'localhost'
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

export { loggerFactory };
