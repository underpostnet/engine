import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { htmls, s } from './VanillaJs.js';
import { Modal } from './Modal.js';
import { Worker } from './Worker.js';

// Router

const RouterEvents = {};
const closeModalRouteChangeEvents = {};

const logger = loggerFactory(import.meta);

// Router
/**
 * The function `getProxyPath` returns a proxy path based on the current location pathname.
 * @returns The `getProxyPath` function returns the path based on the current location. If the first
 * segment of the pathname is not empty, it returns `/<first-segment>/`, otherwise it returns `/`. If
 * the `window.Routes` object exists and the path is not `/` and the path without the trailing slash is
 * a key in the `window.Routes` object, it returns `/`.
 */
const getProxyPath = () => {
  let path = location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}/` : '/';
  if (window.Routes && path !== '/' && path.slice(0, -1) in window.Routes()) path = '/';
  return path;
};

/**
 * The setPath function in JavaScript updates the browser's history with a new path, state, and title.
 * @param path - The `path` parameter is a string that represents the URL path where you want to
 * navigate or update in the browser history. It is the first parameter in the `setPath` function and
 * has a default value of `'/'`.
 * @param stateStorage - The `stateStorage` parameter in the `setPath` function is an object that
 * represents the state object associated with the new history entry. It is used to store data related
 * to the state of the application when navigating to a new path using `history.pushState()`. This data
 * can be accessed later
 * @param title - The `title` parameter in the `setPath` function is a string that represents the
 * title of the new history entry. It is used as the title of the new history entry in the browser's
 * history.
 * @memberof VanillaJS
 */
const setPath = (path = '/', stateStorage = {}, title = '') => {
  logger.warn(`Set path input`, `${path}`);
  if (!path) path = '/';

  const [inputPath, inputSearch] = `${path}`.split('?');

  let sanitizedPath = (inputPath[0] !== '/' ? `/${inputPath}` : inputPath)
    .trim()
    .replaceAll('//', '/')
    .replaceAll(`\\`, '/');

  if (sanitizedPath.length > 1 && sanitizedPath[sanitizedPath.length - 1] === '/')
    sanitizedPath = sanitizedPath.slice(0, -1);

  const newFullPath = `${sanitizedPath}${inputSearch ? `?${inputSearch}` : location.search}${location.hash ?? ''}`;
  const currentFullPath = `${window.location.pathname}${location.search}${location.hash}`;
  logger.warn(`Set path output`, {
    inputPath: inputPath,
    inputSearch: inputSearch,
    sanitizedPath: sanitizedPath,
    currentLocationSearch: location.search,
    currentLocationHash: location.hash,
  });
  if (currentFullPath === newFullPath) {
    logger.warn('Prevent overwriting same path', {
      newFullPath,
      currentFullPath,
    });
    return;
  }
  return history.pushState.call(history, stateStorage, title, newFullPath);
};

/**
 * The function `getQueryParams` extracts query parameters from the current URL and returns them as an
 * object.
 * @returns An object containing the query parameters from the current URL is being returned.
 */
const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  let queries = {};
  for (const param of params) {
    queries[param[0]] = param[1];
  }
  return queries;
};

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

const setQueryPath = (options = { path: '', queryPath: '' }, queryKey = 'cid') => {
  const { queryPath, path } = options;
  const newUri = `${getProxyPath()}${path === 'home' ? '' : `${path}/`}${
    typeof queryPath === 'string' && queryPath ? `?${queryKey}=${queryPath}` : ''
  }`;
  const currentUri = `${window.location.pathname}${location.search}`;
  if (currentUri !== newUri && currentUri !== `${newUri}/`) setPath(newUri, {}, '');
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
  getQueryParams,
  getProxyPath,
  setPath,
};
