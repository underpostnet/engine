import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath, getQueryParams, htmls, s, setPath } from './VanillaJs.js';
import { Modal } from './Modal.js';
import { Worker } from './Worker.js';

// Router

const logger = loggerFactory(import.meta);

const renderTitle = (title) => htmls('title', html`${title ? `${title} | ` : ''}${Worker.title}`);

const setDocTitle = (options = { Routes: () => {}, route: '', NameApp: async () => '' }) => {
  const { Routes, route, NameApp } = options;
  let title = titleFormatted(Routes()[`/${route}`].title);
  if (Routes()[`/${route}`].upperCase) title = title.toUpperCase();
  renderTitle(title);
  {
    const routeId = route === '' ? 'home' : route;
    if (s(`.main-btn-${routeId}`)) {
      if (s(`.main-btn-menu-active`)) s(`.main-btn-menu-active`).classList.remove(`main-btn-menu-active`);
      if (s(`.main-btn-${routeId}`)) s(`.main-btn-${routeId}`).classList.add(`main-btn-menu-active`);
    }
  }
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

    if (path === pushPath) {
      for (const event of Object.keys(RouterEvents)) RouterEvents[event](routerEvent);
      setDocTitle({ Routes, route, NameApp });
      return Routes()[`/${route}`].render();
    }
  }
};

const LoadRouter = function (RouterInstance) {
  Router(RouterInstance);
  window.onpopstate = (e) => Router({ ...RouterInstance, e });
};

const setQueryPath = (options = { path: '', queryPath: '' }, queryKey = 'cid') => {
  const { queryPath, path } = options;
  const newUri = `${getProxyPath()}${path === 'home' ? '' : `${path}/`}${
    typeof queryPath === 'string' ? `?${queryKey}=${queryPath}` : ''
  }`;
  const currentUri = `${window.location.pathname}${location.search}`;
  if (currentUri !== newUri && currentUri !== `${newUri}/`) setPath(newUri);
};

const listenQueryPathInstance = ({ id, routeId, event }, queryKey = 'cid') => {
  RouterEvents[id] = ({ path, pushPath, proxyPath, route }) => {
    if ((route === '' && routeId === 'home') || (route && routeId && route === routeId)) {
      setTimeout(() => {
        const path = getQueryParams()[queryKey];
        if (path) event(path);
        else event('');
      });
    }
  };
  if (routeId && routeId !== 'home')
    setTimeout(() => {
      RouterEvents[id]({ route: routeId });
    });
};

const closeModalRouteChangeEvents = {};
const triggerCloseModalRouteChangeEvents = (newPath) => {
  console.warn('[closeModalRouteChangeEvent]', newPath);
  for (const event of Object.keys(closeModalRouteChangeEvents)) closeModalRouteChangeEvents[event](newPath);
};

const closeModalRouteChangeEvent = (options = {}) => {
  const { route, RouterInstance, homeCid } = options;
  if (!route) return;

  let path = window.location.pathname;
  if (path[path.length - 1] !== '/') path = `${path}/`;
  let newPath = `${getProxyPath()}`;

  if (path !== newPath) {
    for (const subIdModal of Object.keys(Modal.Data).reverse()) {
      if (Modal.Data[subIdModal]?.options?.route) {
        newPath = `${newPath}${Modal.Data[subIdModal].options.route}`;
        triggerCloseModalRouteChangeEvents(newPath);
        setPath(newPath);
        Modal.setTopModalCallback(subIdModal);
        return setDocTitle({ ...RouterInstance, route: Modal.Data[subIdModal].options.route });
      }
    }
    newPath = `${newPath}${homeCid ? `?cid=${homeCid}` : ''}`;
    triggerCloseModalRouteChangeEvents(newPath);
    setPath(newPath);
    return setDocTitle({ ...RouterInstance, route: '' });
  }
};

const handleModalViewRoute = (options = {}) => {
  const { route, RouterInstance } = options;
  if (!route) return;

  let path = window.location.pathname;
  if (path !== '/' && path[path.length - 1] === '/') path = path.slice(0, -1);
  const proxyPath = getProxyPath();
  const newPath = `${proxyPath}${route}`;

  if (path !== newPath) {
    setPath(newPath);
    setDocTitle({ ...RouterInstance, route });
  }
};

export {
  Router,
  setDocTitle,
  LoadRouter,
  RouterEvents,
  setQueryPath,
  listenQueryPathInstance,
  closeModalRouteChangeEvent,
  handleModalViewRoute,
  closeModalRouteChangeEvents,
  renderTitle,
};
