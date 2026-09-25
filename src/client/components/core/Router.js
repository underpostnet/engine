/**
 * Router module for handling routing in a PWA application.
 *
 * URL architecture: the path is canonical identity, the query is optional state.
 *
 * - A resource with a public URL is identified only by a path parameter, through the `PublicRoutes`
 *   table shared with the server (`/u/:username`, `/entry/:stableSlug`, `/content/:stableSlug`).
 *   Components neither build nor parse these paths themselves: they call `publicRoutePath`,
 *   `navigatePublicRoute`, `presentPublicRoute` and `getPublicRouteParam`.
 * - The query string carries view and request state a page can present with or without —
 *   pagination, filters, search terms, a selected tab, the item a view is focused on
 *   (`setQueryParams`, `setQueryPath`). It never identifies the resource a page is about; a
 *   resource that needs a shareable URL belongs in `PublicRoutes`.
 * @module src/client/components/core/Router.js
 * @namespace PwaRouter
 */

import { titleFormatted, PublicRoutes, parsePublicRoute, publicRoutePathFactory } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { s } from './VanillaJs.js';
import { Modal, subMenuHandler } from './Modal.js';
import { Worker } from './Worker.js';

const logger = loggerFactory(import.meta, { trace: true });

/**
 * @type {function | null}
 * @description The active routes function registered by the current app router.
 * Replaces the former `window.Routes` global so `getProxyPath` can resolve
 * sub-directory proxy paths without polluting the global scope.
 * @memberof PwaRouter
 */
let _activeRoutes = null;

/**
 * @type {object | null}
 * @description The router instance `LoadRouter` started, so in-app navigation dispatches exactly
 * like a history traversal.
 * @memberof PwaRouter
 */
let _routerInstance = null;

/**
 * Registers the active routes function for the current app.
 * Called automatically by `LoadRouter`; should not be called manually.
 * @param {function} routesFn - A function returning the routes object.
 * @memberof PwaRouter
 */
const registerRoutes = (routesFn) => {
  _activeRoutes = routesFn;
};

/**
 * @type {Object.<string, function>}
 * @description Holds event listeners for router changes.
 * @memberof PwaRouter
 */
const RouterEvents = {};

/**
 * @type {Object.<string, function>}\n
 * @description Holds event listeners for query parameter changes.\n
 * @memberof PwaRouter
 */
const queryParamsChangeListeners = {};

/**
 * @type {string[]}
 * @description Array of core UI component IDs that should not trigger modal close route changes.
 * @memberof PwaRouter
 */
const coreUI = ['modal-menu', 'main-body', 'main-body-top', 'bottom-bar', 'board-notification'];
/**
 * @type {Object.<string, function>}
 * @description Holds event listeners for route changes that should close a modal.
 * @memberof PwaRouter
 */
const closeModalRouteChangeEvents = {};

/**
 * Deferred promise that resolves once the full UI (including deferred slide-menu DOM
 * setup in Modal) is ready.  Any code that depends on the complete DOM — route handlers,
 * session callbacks, panel updates, etc. — can simply `await RouterReady` instead of
 * scattering individual null-checks across every microfrontend.
 *
 * Resolved by calling `setRouterReady()`, which should happen exactly once at the end
 * of Modal's deferred slide-menu `setTimeout` block.
 * @type {Promise<void>}
 * @memberof PwaRouter
 */
let _routerReadyResolve;
const RouterReady = new Promise((resolve) => {
  _routerReadyResolve = resolve;
});

/**
 * Signals that the deferred UI setup is complete and the router (and any other
 * awaiter of `RouterReady`) may safely access the full DOM.
 * This must be called exactly once – typically at the end of Modal's deferred
 * slide-menu `setTimeout` block.
 * @memberof PwaRouter
 */
const setRouterReady = () => {
  if (_routerReadyResolve) {
    _routerReadyResolve();
    _routerReadyResolve = undefined;
  }
};

/**
 * Determines the base path for the application, often used for routing within a sub-directory.
 * It checks the current URL's pathname and the active registered routes to return the appropriate proxy path.
 *
 * @returns {string} The calculated proxy path. Returns `/<first-segment>/` if a segment exists,
 *          otherwise `/`. If the registered routes indicate the path is a root route, it returns `/`.
 * @memberof PwaRouter
 */
const getProxyPath = () => {
  let path = location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}/` : '/';
  if (_activeRoutes && path !== '/' && path.slice(0, -1) in _activeRoutes()) path = '/';
  return path;
};

const isCurrentRoute = (route) => {
  const normalize = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  return normalize(window.location.pathname) === normalize(`${getProxyPath()}${route}`);
};

/**
 * Sets the browser's path using the History API. It sanitizes the path, handles query strings and hashes,
 * and prevents pushing the same state twice unless forced or using replace mode.
 * @param {string} [path='/'] - The new path to set. Can include query strings and hashes.
 * @param {object} [options={ removeSearch: false, removeHash: false, replace: false, force: false }] - Options for path manipulation.
 * @param {boolean} [options.removeSearch=false] - If true, removes the search part of the URL.
 * @param {boolean} [options.removeHash=false] - If true, removes the hash part of the URL. Defaults to `false`.
 * @param {boolean} [options.replace=false] - If true, uses replaceState instead of pushState.
 * @param {boolean} [options.force=false] - If true, allows navigation to the same path (useful for query param changes).
 * @param {object} [stateStorage={}] - State object to associate with the history entry.
 * @param {string} [title=''] - The title for the new history entry.
 * @memberof PwaRouter
 * @returns {void | undefined} Returns `undefined` if the new path is the same as the current path and not forced, otherwise `void` (result of `history.pushState` or `history.replaceState`).
 */
const setPath = (
  path = '/',
  options = { removeSearch: false, removeHash: false, replace: false, force: false },
  stateStorage = {},
  title = '',
) => {
  // logger.warn(`Set path input`, `${path}`);
  if (!path) path = '/';

  let [inputPath, inputSearchHash] = `${path}`.split('?');
  let [inputSearch, inputHash] = inputSearchHash ? inputSearchHash.split('#') : [];

  let sanitizedPath = (inputPath[0] !== '/' ? `/${inputPath}` : inputPath)
    .trim()
    .replaceAll('//', '/')
    .replaceAll(`\\`, '/');

  if (sanitizedPath.length > 1 && sanitizedPath[sanitizedPath.length - 1] === '/')
    sanitizedPath = sanitizedPath.slice(0, -1);

  const newFullPath = `${sanitizedPath}${inputSearch && !options.removeSearch ? `?${inputSearch}` : ''}${
    inputHash && !options.removeHash ? `#${inputHash}` : ''
  }`;
  // The current path is compared in the same form as the new one: `/docs/` and `/docs` are one route.
  const currentPathname =
    window.location.pathname.length > 1 && window.location.pathname.endsWith('/')
      ? window.location.pathname.slice(0, -1)
      : window.location.pathname;
  const currentFullPath = `${currentPathname}${location.search}${location.hash}`;
  // logger.warn(`Set path output`, {
  //   inputPath: inputPath,
  //   inputSearch: inputSearch,
  //   inputHash: inputHash,
  //   sanitizedPath: sanitizedPath,
  //   currentLocationSearch: location.search,
  //   currentLocationHash: location.hash,
  //   currentFullPath,
  //   newFullPath,
  // });
  if (currentFullPath === newFullPath && !options.force) {
    // logger.warn('Prevent overwriting same path', { currentFullPath, newFullPath });
    return;
  }

  if (options.replace) {
    return history.replaceState.call(history, stateStorage, title, newFullPath);
  } else {
    return history.pushState.call(history, stateStorage, title, newFullPath);
  }
};

/**
 * Extracts query parameters from the current URL's search string and returns them as an object.
 * @returns An object containing the query parameters from the current URL is being returned.
 * @memberof PwaRouter
 */
const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  let queries = {};
  for (const param of params) {
    queries[param[0]] = param[1];
  }
  return queries;
};

/**
 * Sanitizes a route string for use in CSS classes or other identifiers.
 * Defaults to 'home' for empty, '/', or '\' routes.
 * @param {string} route - The route string to sanitize.
 * @returns {string} The sanitized route string.
 * @memberof PwaRouter
 */
const sanitizeRoute = (route) =>
  !route || route === '/' || route === `\\`
    ? 'home'
    : route
        .toLowerCase()
        .replaceAll('/', '')
        .replaceAll(`\\`, '')
        .replaceAll(' ', '-')
        .replaceAll(getProxyPath().replaceAll('/', ''), '');

/**
 * The titles views declared for the paths they present (the entry a panel loaded), keyed by path:
 * a public route is titled for its resource on first render and whenever its view returns to the
 * front, the way the server titled the shell it served for that path.
 */
const viewTitles = {};
let servedTitleKept = false;

/**
 * The shell served for a public route arrives titled for its resource (`<title> | <site>`): the
 * first title change keeps that title for its path, so the first render shows it rather than the
 * route's label. A shell built for a static view is titled with the site name alone.
 */
const keepServedTitle = () => {
  servedTitleKept = true;
  const servedTitle = s('title')?.textContent ?? '';
  const siteSuffix = ` | ${Worker.title}`;
  if (servedTitle.length > siteSuffix.length && servedTitle.endsWith(siteSuffix))
    viewTitles[window.location.pathname] = servedTitle.slice(0, -siteSuffix.length);
};

/**
 * Sets the document title and updates the active state of the main menu button corresponding to the route.
 * The title is the one declared for the current path, else the formatted route, and ends with the
 * site name (`Worker.title`): always for a declared title, so it reads as the server renders it,
 * and for a route label unless the label already names the site.
 * @param {string} route - The current route string.
 * @param {string} [title] - The title of the resource the current path presents, kept for the path.
 * @memberof PwaRouter
 */
const setDocTitle = (route, title) => {
  let _route = sanitizeRoute(route);
  // logger.warn('setDocTitle', _route);
  if (!servedTitleKept) keepServedTitle();
  if (title) viewTitles[window.location.pathname] = title;
  const viewTitle = viewTitles[window.location.pathname];
  const label = viewTitle ?? titleFormatted(_route);
  const suffixed = viewTitle !== undefined || !label.match(Worker.title.toLowerCase());
  document.title = `${label}${suffixed ? ` | ${Worker.title}` : ''}`;

  const btnSelector = _route === 'u' ? 'public-profile' : _route;
  if (s(`.main-btn-${btnSelector}`)) {
    if (s(`.main-btn-menu-active`)) s(`.main-btn-menu-active`).classList.remove(`main-btn-menu-active`);
    if (s(`.main-btn-${btnSelector}`)) s(`.main-btn-${btnSelector}`).classList.add(`main-btn-menu-active`);
  }
};

/**
 * Main router function. It matches the current URL path against the provided routes configuration
 * and renders the corresponding component. It also fires registered router events.
 * @param {object} [options={ Routes: () => {}, e: new PopStateEvent() }] - The router options.
 * @param {function} options.Routes - A function that returns the routes object.
 * @param {PopStateEvent} options.e - The popstate event object.
 * @memberof PwaRouter
 */
const Router = function (options = { Routes: () => {}, e: new PopStateEvent() }) {
  const { e, Routes } = options;
  const proxyPath = getProxyPath();
  const publicRoute = getPublicRoute();
  // A dynamic public path renders its namespace's route; its parameter travels on the event.
  let matchPath = publicRoute ? `${proxyPath}${publicRoute.namespace}` : window.location.pathname;
  if (matchPath[matchPath.length - 1] !== '/') matchPath = `${matchPath}/`;

  for (let route of Object.keys(Routes())) {
    route = route.slice(1);
    let pushPath = `${proxyPath}${route}`;
    if (pushPath[pushPath.length - 1] !== '/') pushPath = `${pushPath}/`;

    if (matchPath === pushPath) {
      const routerEvent = { path: matchPath, pushPath, route, publicRoute };
      for (const event of Object.keys(RouterEvents)) RouterEvents[event](routerEvent);
      subMenuHandler(Object.keys(Routes()), route);
      setDocTitle(route);
      return Routes()[`/${route}`].render();
    }
  }
};

/**
 * Initializes the router and sets up the `onpopstate` event listener to handle browser
 * back/forward navigation.
 * @param {object} RouterInstance - The router instance configuration, including the `Routes` function.
 * @memberof PwaRouter
 */
const LoadRouter = async function (RouterInstance) {
  await RouterReady;
  if (RouterInstance.Routes) registerRoutes(RouterInstance.Routes);
  _routerInstance = RouterInstance;
  Router(RouterInstance);
  window.onpopstate = (e) => {
    Router({ ...RouterInstance, e });
    // Notify query params listeners on browser back/forward navigation
    const updatedParams = getQueryParams();
    for (const listenerId in queryParamsChangeListeners) {
      if (Object.hasOwnProperty.call(queryParamsChangeListeners, listenerId)) {
        queryParamsChangeListeners[listenerId](updatedParams);
      }
    }
  };
};

/**
 * Sets a route's path with one view-state query parameter: the item a view is focused on inside
 * its own route (a docs section, a calendar event). Not for resource identity — that is a
 * `PublicRoutes` path.
 * @param {object} [options={ path: '', queryPath: '' }] - The path options.
 * @param {string} [options.path=''] - The base path segment.
 * @param {string} [options.queryPath=''] - The query parameter value; empty clears it.
 * @param {string} queryKey - The query parameter key, named for what the view selects.
 * @memberof PwaRouter
 */
const setQueryPath = (options = { path: '', queryPath: '' }, queryKey, navOptions = {}) => {
  const { queryPath, path } = options;
  const { replace = false } = navOptions;
  const newUri = `${getProxyPath()}${path === 'home' ? '' : `${path}`}${
    typeof queryPath === 'string' && queryPath ? `?${queryKey}=${queryPath}` : ''
  }`;
  const currentUri = `${window.location.pathname}${location.search}`;

  // For query parameter changes on the same path, force the navigation to ensure proper history
  const isSamePath = window.location.pathname === new URL(newUri, window.location.origin).pathname;
  const isDifferentQuery = window.location.search !== new URL(newUri, window.location.origin).search;
  const shouldForce = isSamePath && isDifferentQuery;

  if (currentUri !== newUri && currentUri !== `${newUri}/`) {
    setPath(newUri, { force: shouldForce, replace }, '');
  }
};

/**
 * The dynamic public route (`profile`, `entry`, `content`) a path presents.
 * @param {string} [pathname] - Defaults to the current location.
 * @returns {{ name: string, namespace: string, params: Object<string, string> } | null}
 * @memberof PwaRouter
 */
const getPublicRoute = (pathname = window.location.pathname) => parsePublicRoute(pathname, getProxyPath());

/**
 * @param {string} name - A `PublicRoutes` key.
 * @returns {string|null} The current location's parameter for that route, `null` on any other path.
 * @memberof PwaRouter
 */
const getPublicRouteParam = (name) => {
  const route = getPublicRoute();
  return route && route.name === name ? route.params[PublicRoutes[name].param] : null;
};

/**
 * @param {string} name - A `PublicRoutes` key.
 * @param {string} value - The route parameter.
 * @returns {string|null} Canonical path under the app's proxy path, `null` for an invalid parameter.
 * @memberof PwaRouter
 */
const publicRoutePath = (name, value) => publicRoutePathFactory(name, value, getProxyPath());

/**
 * Pushes (or replaces) a path and renders it, the same way a history traversal does.
 * @param {string} path
 * @param {{ replace?: boolean }} [options]
 * @memberof PwaRouter
 */
const navigate = (path, { replace = false } = {}) => {
  if (path === window.location.pathname) return;
  setPath(path, { replace });
  if (_routerInstance) Router(_routerInstance);
};

/**
 * Navigates to a dynamic public route.
 * @param {string} name - A `PublicRoutes` key.
 * @param {string} value - The route parameter.
 * @param {{ replace?: boolean }} [options]
 * @returns {string|null} The path navigated to, `null` for an invalid parameter.
 * @memberof PwaRouter
 */
const navigatePublicRoute = (name, value, options = {}) => {
  const path = publicRoutePath(name, value);
  if (path) navigate(path, options);
  return path;
};

/**
 * Records a public route as the one a view already shows, without rendering again: the URL
 * catches up with state the component has just rendered (a canonical username, a saved entry).
 * @param {string} name - A `PublicRoutes` key.
 * @param {string} value - The route parameter.
 * @param {{ idModal?: string, replace?: boolean }} [options]
 * @memberof PwaRouter
 */
const presentPublicRoute = (name, value, { idModal, replace = false } = {}) => {
  const path = publicRoutePath(name, value);
  if (!path) return;
  setViewPath(idModal, path);
  setPath(path, { replace });
};

/**
 * @param {string} [idModal]
 * @param {string} path - The path the view presents.
 * @memberof PwaRouter
 */
const setViewPath = (idModal, path) => {
  if (idModal && Modal.Data[idModal]) Modal.Data[idModal].path = path;
};

/**
 * The path a view last presented, so bringing it back to the front restores its resource and not
 * just its bare route. The home view (`main-body`) presents the app root unless a public route
 * rendered into it.
 * @param {string} idModal
 * @returns {string}
 * @memberof PwaRouter
 */
const getViewPath = (idModal) =>
  Modal.Data[idModal]?.path ?? `${getProxyPath()}${Modal.Data[idModal]?.options?.route ?? ''}`;

/**
 * Registers a listener for route changes that specifically watches for a `queryKey` parameter
 * on a matching `routeId`. The provided event callback is triggered with the query parameter's value.
 * @param {object} options - The listener options.
 * @param {string} options.id - A unique ID for the listener.
 * @param {string} options.routeId - The route ID to listen for.
 * @param {function(string): void} options.event - The callback function to execute with the query path value (or an empty string if not found).
 * @param {string} queryKey - The view-state query parameter key `setQueryPath` writes for this route.
 * @memberof PwaRouter
 */
const listenQueryPathInstance = ({ id, routeId, event }, queryKey) => {
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

/**
 * Registers a listener for changes to query parameters.\n
 * The provided event callback is triggered with the current query parameters object.\n
 * @param {object} options - The listener options.\n
 * @param {string} options.id - A unique ID for the listener.\n
 * @param {function(Object.<string, string>): void} options.event - The callback function to execute with the new query parameters.\n
 * @memberof PwaRouter
 */
const listenQueryParamsChange = ({ id, event }) => {
  queryParamsChangeListeners[id] = event;
  // Immediately call with current query params for initial state
  setTimeout(() => {
    if (queryParamsChangeListeners[id] === event) event(getQueryParams());
  });
};

const unlistenQueryParamsChange = (id, event) => {
  if (queryParamsChangeListeners[id] === event) delete queryParamsChangeListeners[id];
};

/**
 * Handles the logic for changing the route when a modal is closed. It determines the next URL
 * based on the remaining open modals or falls back to a home URL.
 * @param {object} [options={}] - Options for the modal close event.
 * @param {string} options.closedId - The ID of the modal that was just closed.
 * @memberof PwaRouter
 */
const closeModalRouteChangeEvent = (options = {}) => {
  // logger.warn('closeModalRouteChangeEvent', options);
  const { closedId } = options;
  if (!closedId) return;
  if (coreUI.find((id) => closedId.startsWith(id))) {
    // logger.warn('prevent core ui component close');
    return;
  }

  const remainingModals = Object.keys(Modal.Data).filter(
    (id) => id !== closedId && (Modal.Data[id]?.options?.route || Modal.Data[id]?.options?.query),
  );

  const topModalId = remainingModals.reverse().find((id) => Modal.Data[id]);

  for (const event of Object.keys(closeModalRouteChangeEvents)) closeModalRouteChangeEvents[event]();
  if (topModalId) Modal.setTopModalCallback(topModalId);
  setPath(getViewPath(topModalId ?? 'main-body'));
  setDocTitle(Modal.Data[topModalId]?.options?.route ?? '');
};

/**
 * Handles routing for modals that are meant to be displayed as a "view" (e.g., a full-page modal).
 * It updates the URL to reflect the modal's route and records the path the view presents.
 * @param {object} [options={ route: 'home' }] - The options for handling the modal view route.
 * @param {string} options.route - The route associated with the modal view.
 * @param {string} [options.idModal] - The view's modal id.
 * @param {string} [options.publicRoute] - A `PublicRoutes` key the view also presents (a blog view
 *   showing `/entry/:stableSlug`).
 * @memberof PwaRouter
 */
const handleModalViewRoute = (
  options = { RouterInstance: { Routes: () => {} }, route: '', idModal: '', publicRoute: '' },
) => {
  const { route, RouterInstance, idModal, publicRoute } = options;
  if (!route) return;

  let path = window.location.pathname;
  if (path !== '/' && path[path.length - 1] === '/') path = path.slice(0, -1);
  const newPath = `${getProxyPath()}${route}`;
  if (RouterInstance && RouterInstance.Routes) subMenuHandler(Object.keys(RouterInstance.Routes()), route);

  // Already on the view's route, a resource under it (`/u/alice` for 'u'), or a public route it presents.
  const presentsCurrentPath =
    path === newPath || path.startsWith(`${newPath}/`) || (!!publicRoute && getPublicRoute()?.name === publicRoute);

  if (!presentsCurrentPath) {
    setPath(newPath);
    setDocTitle(newPath);
  }
  setViewPath(idModal, presentsCurrentPath ? path : newPath);
};

/**
 * Sets or updates query parameters in the URL.
 * It preserves the existing path, hash, and other query parameters.
 *
 * @param {Object.<string, string|number>} newParams - An object of query parameters to set or update.
 *        If a value is `null` or `undefined`, the parameter will be removed.
 * @param {object} [options={ replace: true }] - Options for history manipulation.
 * @param {boolean} [options.replace=true] - If true, uses `history.replaceState` instead of `history.pushState`.
 * @memberof PwaRouter
 */
const setQueryParams = (newParams, options = { replace: true }) => {
  const url = new URL(window.location.href);
  Object.entries(newParams).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });

  const newPath = url.pathname + url.search + url.hash;
  const currentPath = window.location.pathname + window.location.search + window.location.hash;

  // Only update history and trigger listeners if the URL actually changed
  if (newPath === currentPath) {
    return;
  }

  if (options.replace) {
    history.replaceState(history.state, '', newPath);
  } else {
    history.pushState(history.state, '', newPath);
  }

  const updatedParams = getQueryParams();
  for (const listenerId in queryParamsChangeListeners) {
    if (Object.hasOwnProperty.call(queryParamsChangeListeners, listenerId)) {
      queryParamsChangeListeners[listenerId](updatedParams);
    }
  }
};

export {
  RouterEvents,
  registerRoutes,
  closeModalRouteChangeEvents,
  coreUI,
  Router,
  setDocTitle,
  LoadRouter,
  setQueryPath,
  getPublicRoute,
  getPublicRouteParam,
  publicRoutePath,
  navigate,
  navigatePublicRoute,
  presentPublicRoute,
  getViewPath,
  listenQueryPathInstance,
  closeModalRouteChangeEvent,
  handleModalViewRoute,
  getQueryParams,
  getProxyPath,
  isCurrentRoute,
  setPath,
  setQueryParams,
  sanitizeRoute,
  queryParamsChangeListeners,
  listenQueryParamsChange,
  unlistenQueryParamsChange,
  setRouterReady,
  RouterReady,
};
