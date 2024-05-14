const loggerFactory = (meta) => {
  meta = meta.url.split('/').pop();
  const types = ['error', 'warn', 'info', 'debug'];
  const logger = {
    log: function (type, args) {
      if (!location.port && console.log() !== null) {
        console.log = () => null;
        console.error = () => null;
        console.info = () => null;
        console.warn = () => null;
      }
      let stack;
      try {
        _stack;
      } catch (error) {
        stack = error.stack.split('Logger.js')[2].split(')')[1];
      }
      return location.port
        ? console[type](
            `[${meta}] ${new Date().toISOString()} ${type}:`,
            args[0],
            args[1] ? args[1] : args,
            args[1] ? args : stack,
            args[1] ? stack : undefined,
          )
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
