/**
 * Router module for handling routing in a PWA application.
 * @module src/client/components/core/Router.js
 * @namespace PwaRouter
 */

import { titleFormatted } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { htmls, s } from './VanillaJs.js';
import { Modal, subMenuHandler } from './Modal.js';
import { Worker } from './Worker.js';

const logger = loggerFactory(import.meta, { trace: true });

/**
 * @type {Object.<string, function>}
 * @description Holds event listeners for router changes.
 * @memberof PwaRouter
 */
const RouterEvents = {};

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
 * Determines the base path for the application, often used for routing within a sub-directory.
 * It checks the current URL's pathname and `window.Routes` to return the appropriate proxy path.
 *
 * @returns {string} The calculated proxy path. Returns `/<first-segment>/` if a segment exists,
 *          otherwise `/`. If `window.Routes` indicates the path is a root route, it returns `/`.
 * @memberof PwaRouter
 */
const getProxyPath = () => {
  let path = location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}/` : '/';
  if (window.Routes && path !== '/' && path.slice(0, -1) in window.Routes()) path = '/';
  return path;
};

/**
 * Sets the browser's path using the History API. It sanitizes the path, handles query strings and hashes,
 * and prevents pushing the same state twice.
 * @param {string} [path='/'] - The new path to set. Can include query strings and hashes.
 * @param {object} [options={ removeSearch: false, removeHash: false }] - Options for path manipulation.
 * @param {boolean} [options.removeSearch=false] - If true, removes the search part of the URL.
 * @param {boolean} [options.removeHash=false] - If true, removes the hash part of the URL. Defaults to `false`.
 * @param {object} [stateStorage={}] - State object to associate with the history entry.
 * @param {string} [title=''] - The title for the new history entry.
 * @memberof PwaRouter
 * @returns {void | undefined} Returns `undefined` if the new path is the same as the current path, otherwise `void` (result of `history.pushState`).
 */
const setPath = (path = '/', options = { removeSearch: false, removeHash: false }, stateStorage = {}, title = '') => {
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
  const currentFullPath = `${window.location.pathname}${location.search}${location.hash}`;
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
  if (currentFullPath === newFullPath) {
    // logger.warn('Prevent overwriting same path', { currentFullPath, newFullPath });
    return;
  }
  return history.pushState.call(history, stateStorage, title, newFullPath);
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
    : route.toLowerCase().replaceAll('/', '').replaceAll(`\\`, '').replaceAll(' ', '-');

/**
 * Sets the document title and updates the active state of the main menu button corresponding to the route.
 * The title is formatted and appended with the main application title from `Worker.title` if it's not already present.
 * @param {string} route - The current route string.
 * @memberof PwaRouter
 */
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
  let path = window.location.pathname;
  // logger.info(options);

  for (let route of Object.keys(Routes())) {
    route = route.slice(1);
    let pushPath = `${proxyPath}${route}`;

    if (path[path.length - 1] !== '/') path = `${path}/`;
    if (pushPath[pushPath.length - 1] !== '/') pushPath = `${pushPath}/`;

    const routerEvent = { path, pushPath, route };

    if (path === pushPath) {
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
const LoadRouter = function (RouterInstance) {
  Router(RouterInstance);
  window.onpopstate = (e) => Router({ ...RouterInstance, e });
};

/**
 * Sets the URL path with a specific query parameter, commonly used for content IDs.
 * This function constructs a new URI based on the proxy path, a given path, and an optional query parameter.
 * @param {object} [options={ path: '', queryPath: '' }] - The path options.
 * @param {string} [options.path=''] - The base path segment.
 * @memberof PwaRouter
 */
const setQueryPath = (options = { path: '', queryPath: '' }, queryKey = 'cid') => {
  const { queryPath, path } = options;
  const newUri = `${getProxyPath()}${path === 'home' ? '' : `${path}/`}${
    typeof queryPath === 'string' && queryPath ? `?${queryKey}=${queryPath}` : ''
  }`;
  const currentUri = `${window.location.pathname}${location.search}`;
  if (currentUri !== newUri && currentUri !== `${newUri}/`) setPath(newUri, {}, '');
};

/**
 * Registers a listener for route changes that specifically watches for a `queryKey` parameter
 * on a matching `routeId`. The provided event callback is triggered with the query parameter's value.
 * @param {object} options - The listener options.
 * @param {string} options.id - A unique ID for the listener.
 * @param {string} options.routeId - The route ID to listen for.
 * @param {function(string): void} options.event - The callback function to execute with the query path value (or an empty string if not found).
 * @param {string} [queryKey='cid'] - The query parameter key to look for.
 * @memberof PwaRouter
 */
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
  setPath(`${getProxyPath()}${Modal.Data[topModalId]?.options?.route ?? ''}`);
  setDocTitle(Modal.Data[topModalId]?.options?.route ?? '');
};

/**
 * Handles routing for modals that are meant to be displayed as a "view" (e.g., a full-page modal).
 * It updates the URL to reflect the modal's route.
 * @param {object} [options={ route: 'home' }] - The options for handling the modal view route.
 * @param {string} options.route - The route associated with the modal view.
 * @memberof PwaRouter
 */
const handleModalViewRoute = (options = { RouterInstance: { Routes: () => {} }, route: '' }) => {
  const { route, RouterInstance } = options;
  if (!route) return;

  let path = window.location.pathname;
  if (path !== '/' && path[path.length - 1] === '/') path = path.slice(0, -1);
  const proxyPath = getProxyPath();
  const newPath = `${proxyPath}${route}`;
  if (RouterInstance && RouterInstance.Routes) subMenuHandler(Object.keys(RouterInstance.Routes()), route);

  if (path !== newPath) {
    setPath(newPath);
    setDocTitle(newPath);
  }
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

  history.pushState(history.state, '', newPath);
};

export {
  RouterEvents,
  closeModalRouteChangeEvents,
  coreUI,
  Router,
  setDocTitle,
  LoadRouter,
  setQueryPath,
  listenQueryPathInstance,
  closeModalRouteChangeEvent,
  handleModalViewRoute,
  getQueryParams,
  getProxyPath,
  setPath,
  setQueryParams,
  sanitizeRoute,
};
