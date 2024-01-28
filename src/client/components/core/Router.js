import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getURI, htmls } from './VanillaJs.js';

// Router

const logger = loggerFactory(import.meta);

const setDocTitle = (options = { Routes: () => {}, route: '', NameApp: '' }) => {
  const { Routes, route, NameApp } = options;
  let title = titleFormatted(Routes()[`/${route}`].title);
  if (Routes()[`/${route}`].upperCase) title = title.toUpperCase();
  htmls('title', html`${NameApp} | ${title}`);
};

const Router = function (options = { Routes: () => {}, proxyPath: '/', e: {}, NameApp: '' }) {
  const { proxyPath, e, Routes, NameApp } = options;
  let path = getURI();
  logger.info(options);

  for (let route of Object.keys(Routes())) {
    route = route.slice(1);
    let pushPath = `${proxyPath}${route}`;

    if (path[path.length - 1] !== '/') path = `${path}/`;
    if (pushPath[pushPath.length - 1] !== '/') pushPath = `${pushPath}/`;

    logger.info({ path, pushPath, proxyPath, route });

    if (path === pushPath) {
      setDocTitle({ Routes, route, NameApp });
      return Routes()[`/${route}`].render();
    }
  }
};

export { Router, setDocTitle };
