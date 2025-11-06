import { getCurrentTrace } from './CommonJs.js';

const loggerFactory = (meta, options = { trace: false }) => {
  meta = meta.url.split('/').pop();
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      if (!window.renderPayload.dev) return;
      if (options.trace === true) args.push(getCurrentTrace().split('Logger.js:23')[1]);
      return console[type](`[${meta}] ${new Date().toISOString()} ${type}:`, ...args);
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
