import { getIdModule } from './CommonJs.js';

const loggerFactory = (meta) => {
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      return console[type](`[${getIdModule(meta)}] ${new Date().toISOString()} ${type}:`, args);
    },
  };
  types.map(
    (type) =>
      (logger[type] = function (...args) {
        return this.log(type, args);
      })
  );
  return logger;
};

export { loggerFactory };
