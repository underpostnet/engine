import Underpost from '../index.js';
import { actionInitLog, loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

const logRuntimeRouter = () => {
  const displayLog = {};

  for (const host of Object.keys(Underpost.deployNetwork))
    for (const path of Object.keys(Underpost.deployNetwork[host]))
      displayLog[Underpost.deployNetwork[host][path].publicHost] = Underpost.deployNetwork[host][path].local;

  logger.info('Runtime network', displayLog);
};

const listenServerFactory = (logic = async () => {}) => {
  return {
    listen: async (...args) => (
      setTimeout(() => {
        const message = 'Listen server factory timeout';
        logger.error(message);
        throw new Error(message);
      }, 80000000), // ~ 55 days
      (logic ? await logic(...args) : undefined, args[1]())
    ),
  };
};

const listenPortController = async (server, port, metadata) =>
  new Promise((resolve) => {
    try {
      if (port === ':') {
        server.listen(port, actionInitLog);
        return resolve(true);
      }

      const { host, path, client, runtime, meta } = metadata;
      const error = [];
      if (port === undefined) error.push(`port`);
      if (host === undefined) error.push(`host`);
      if (path === undefined) error.push(`path`);
      if (client === undefined) error.push(`client`);
      if (runtime === undefined) error.push(`runtime`);
      if (meta === undefined) error.push(`meta`);
      if (error.length > 0) throw new Error('Listen port controller requires values: ' + error.join(', '));

      server.listen(port, () => {
        if (!Underpost.deployNetwork[host]) Underpost.deployNetwork[host] = {};
        Underpost.deployNetwork[host][path] = {
          meta,
          client,
          runtime,
          port,
          publicHost:
            port === 80
              ? `http://${host}${path}`
              : port === 443
              ? `https://${host}${path}`
              : `http://${host}:${port}${path}`,
          local: `http://localhost:${port}${path}`,
          apis: metadata.apis,
        };

        return resolve(true);
      });
    } catch (error) {
      logger.error(error, { metadata, port, stack: error.stack });
      resolve(false);
    }
  });

export { listenPortController, logRuntimeRouter, listenServerFactory };
