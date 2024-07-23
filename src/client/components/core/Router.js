import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath, getQueryParams, htmls, setPath } from './VanillaJs.js';

// Router

const logger = loggerFactory(import.meta);

const setDocTitle = (options = { Routes: () => {}, route: '', NameApp: '' }) => {
  const { Routes, route, NameApp } = options;
  let title = titleFormatted(Routes()[`/${route}`].title);
  if (Routes()[`/${route}`].upperCase) title = title.toUpperCase();
  htmls('title', html`${title} | ${NameApp}`);
};

const RouterEvents = {};

const Router = function (options = { Routes: () => {}, e: new PopStateEvent(), NameApp: '' }) {
  const { e, Routes, NameApp } = options;
  const proxyPath = getProxyPath();
  let path = window.location.pathname;
  logger.info(options);

  for (let route of Object.keys(Routes())) {
    route = route.slice(1);
    let pushPath = `${proxyPath}${route}`;

    if (path[path.length - 1] !== '/') path = `${path}/`;
    if (pushPath[pushPath.length - 1] !== '/') pushPath = `${pushPath}/`;

    const routerEvent = { path, pushPath, route };

    logger.info(routerEvent);

    for (const event of Object.keys(RouterEvents)) RouterEvents[event](routerEvent);

    if (path === pushPath) {
      setDocTitle({ Routes, route, NameApp });
      return Routes()[`/${route}`].render();
    }
  }
};

const LoadRouter = function (RouterInstance) {
  Router(RouterInstance);
  window.onpopstate = (e) => Router({ ...RouterInstance, e });
};

const setQueryPath = (options = { path: '', queryPath: '' }, queryKey = 'p') => {
  const { queryPath, path } = options;
  const newUri = `${getProxyPath()}${path}${queryPath ? `/?${queryKey}=${queryPath}` : ''}`;
  const currentUri = `${window.location.pathname}${location.search}`;
  if (currentUri !== newUri && currentUri !== `${newUri}/`) setPath(newUri);
};

const listenQueryPathInstance = ({ id, routeId, event }, queryKey = 'p') => {
  RouterEvents[id] = ({ path, pushPath, proxyPath, route }) => {
    if (route === routeId) {
      setTimeout(() => {
        const path = getQueryParams()[queryKey];
        if (path) event(path);
      });
    }
  };
  setTimeout(() => {
    RouterEvents[id]({ route: routeId });
  });
};

export { Router, setDocTitle, LoadRouter, RouterEvents, setQueryPath, listenQueryPathInstance };
