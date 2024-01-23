import { getIdModule } from './CommonJs.js';

const loggerFactory = (meta) => {
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      let stack;
      try {
        _stack;
      } catch (error) {
        stack = error.stack.split('Logger.js')[2].split(')')[1];
      }
      return console[type](`[${getIdModule(meta)}] ${new Date().toISOString()} ${type}:`, args, stack);
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
