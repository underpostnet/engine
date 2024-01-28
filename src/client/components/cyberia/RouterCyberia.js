import { loggerFactory } from '../core/Logger.js';
import { getProxyPath } from '../core/VanillaJs.js';
import { RoutesCyberia } from './RoutesCyberia.js';

const logger = loggerFactory(import.meta);

const RouterCyberia = function () {
  // getProxyPath() -> /game/
  // location.pathname -> /game/bag/

  logger.info(location.pathname);
  switch (location.pathname) {
    case `${getProxyPath()}bag/`:
      RoutesCyberia()['/bag'].render();
      break;

    default:
      break;
  }
};

export { RouterCyberia };
