import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath, getQueryParams, htmls, s, setPath } from './VanillaJs.js';
import { Modal } from './Modal.js';
import { Worker } from './Worker.js';

// Router

const RouterEvents = {};
const closeModalRouteChangeEvents = {};

const logger = loggerFactory(import.meta);

const sanitizeRoute = (route) =>
  !route || route === '/' || route === `\\`
    ? 'home'
    : route.toLowerCase().replaceAll('/', '').replaceAll(`\\`, '').replaceAll(' ', '-');

const setDocTitle = (route) => {
  const _route = sanitizeRoute(route);
  // logger.warn('setDocTitle', _route);
  const title = titleFormatted(_route);
  htmls('title', html`${title}${title.match(Worker.title.toLowerCase()) ? '' : ` | ${Worker.title}`}`);
  if (s(`.main-btn-${_route}`)) {
    if (s(`.main-btn-menu-active`)) s(`.main-btn-menu-active`).classList.remove(`main-btn-menu-active`);
    if (s(`.main-btn-${_route}`)) s(`.main-btn-${_route}`).classList.add(`main-btn-menu-active`);
  }
};

const Router = function (options = { Routes: () => {}, e: new PopStateEvent() }) {
  const { e, Routes } = options;
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
      setDocTitle(route);
      return Routes()[`/${route}`].render();
    }
  }
};

const LoadRouter = function (RouterInstance) {
  Router(RouterInstance);
  window.onpopstate = (e) => Router({ ...RouterInstance, e });
};

const setQueryPath = (options = { path: '', queryPath: '', replace: false }, queryKey = 'cid') => {
  const { queryPath, path, replace } = options;
  const newUri = `${getProxyPath()}${path === 'home' ? '' : `${path}/`}${
    typeof queryPath === 'string' && queryPath ? `?${queryKey}=${queryPath}` : ''
  }`;
  const currentUri = `${window.location.pathname}${location.search}`;
  if (currentUri !== newUri && currentUri !== `${newUri}/`) setPath(newUri, {}, '', { replace });
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

const triggerCloseModalRouteChangeEvents = (newPath) => {
  console.warn('[closeModalRouteChangeEvent]', newPath);
  for (const event of Object.keys(closeModalRouteChangeEvents)) closeModalRouteChangeEvents[event](newPath);
};

const closeModalRouteChangeEvent = (options = {}) => {
  const { closedId, homeCid } = options;
  if (!closedId) return;

  const remainingModals = Object.keys(Modal.Data).filter(
    (id) => id !== closedId && (Modal.Data[id]?.options?.route || Modal.Data[id]?.options?.query),
  );

  const topModalId = remainingModals.reverse().find((id) => Modal.Data[id]);

  if (topModalId) {
    const topModal = Modal.Data[topModalId];
    const route = topModal.options.route;
    const query = topModal.query;
    const path = route ? `${getProxyPath()}${route}` : location.pathname;
    const newUrl = `${path}${query || ''}`;

    triggerCloseModalRouteChangeEvents(newUrl);
    setPath(newUrl, {}, '', { replace: true });
    setDocTitle(route || path);
    Modal.setTopModalCallback(topModalId);
  } else {
    const homeUrl = `${getProxyPath()}${homeCid ? `?cid=${homeCid}` : ''}`;
    triggerCloseModalRouteChangeEvents(homeUrl);
    setPath(homeUrl, {}, '', { replace: true });
    setDocTitle('home');
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
    setDocTitle(newPath);
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
};
