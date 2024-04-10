const loggerFactory = (meta) => {
  meta = meta.url.split('/').pop();
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      let stack;
      try {
        _stack;
      } catch (error) {
        stack = error.stack.split('Logger.js')[2].split(')')[1];
      }
      return console[type](
        `[${meta}] ${new Date().toISOString()} ${type}:`,
        args[0],
        args[1] ? args[1] : args,
        args[1] ? args : stack,
        args[1] ? stack : undefined,
      );
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
