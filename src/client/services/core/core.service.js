import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/Router.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'core';

// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
const getBaseHost = () => (window.renderPayload?.apiBaseHost ? window.renderPayload.apiBaseHost : location.host);

const getApiBasePath = (options) =>
  `${
    options?.proxyPath
      ? `/${options.proxyPath}/`
      : window.renderPayload?.apiBaseProxyPath
        ? window.renderPayload.apiBaseProxyPath == '/'
          ? window.renderPayload.apiBaseProxyPath
          : `${window.renderPayload.apiBaseProxyPath}/`
        : getProxyPath()
  }${window.renderPayload?.apiBasePath ? window.renderPayload.apiBasePath : 'api'}/`;

const getApiBaseUrl = (options = { id: '', endpoint: '', proxyPath: '' }) =>
  `${location.protocol}//${getBaseHost()}${getApiBasePath(options)}${options?.endpoint ? options.endpoint : ''}${
    options?.id ? `/${options.id}` : ''
  }`;

const getWsBasePath = () => (getProxyPath() !== '/' ? `${getProxyPath()}socket.io/` : '/socket.io/');

const getWsBaseUrl = (options = { id: '', endpoint: '', wsBasePath: '' }) =>
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getBaseHost()}${
    options?.wsBasePath !== undefined ? options.wsBasePath : getWsBasePath()
  }${options?.endpoint ? options.endpoint : ''}${options?.id ? `/${options.id}` : ''}`;

const headersFactory = (headerId = '') => {
  const headers = {
    Authorization: Auth.getJWT(),
  };
  switch (headerId) {
    case 'file':
      return headers;

    default:
      headers['Content-Type'] = 'application/json';
      return headers;
  }
};

const payloadFactory = (body) => {
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
};

/**
 * Builds a URL with query parameters for pagination, filtering, and sorting.
 * Supports AG Grid filterModel/sortModel as well as legacy simple sort params.
 * @param {string} baseUrl - The base API URL
 * @param {Object} options - Query options
 * @param {number} [options.page] - Page number for pagination
 * @param {number} [options.limit] - Items per page for pagination
 * @param {Object|string} [options.filterModel] - AG Grid filterModel (object or JSON string)
 * @param {Array|string} [options.sortModel] - AG Grid sortModel (array or JSON string)
 * @param {string} [options.sort] - Simple sort field (legacy)
 * @param {string|boolean} [options.asc] - Simple sort direction (legacy)
 * @param {string} [options.order] - Order string, e.g. "field1:asc,field2:desc" (legacy)
 * @returns {URL} The URL with query parameters
 */
const buildQueryUrl = (baseUrl, options = {}) => {
  const url = new URL(baseUrl);
  const { page, limit, filterModel, sortModel, sort, asc, order } = options;

  // Add pagination params
  if (page !== undefined) url.searchParams.set('page', page);
  if (limit !== undefined) url.searchParams.set('limit', limit);

  // Add filter model (AG Grid format) - send as JSON string
  if (filterModel) {
    const filterStr = typeof filterModel === 'string' ? filterModel : JSON.stringify(filterModel);
    if (filterStr && filterStr !== '{}' && filterStr !== 'null') {
      url.searchParams.set('filterModel', filterStr);
    }
  }

  // Add sort model (AG Grid format) - send as JSON string
  if (sortModel) {
    const sortStr = typeof sortModel === 'string' ? sortModel : JSON.stringify(sortModel);
    if (sortStr && sortStr !== '[]' && sortStr !== 'null') {
      url.searchParams.set('sortModel', sortStr);
    }
  }

  // Add simple sort params for backwards compatibility
  if (sort) url.searchParams.set('sort', sort);
  if (asc !== undefined) url.searchParams.set('asc', asc);
  if (order) url.searchParams.set('order', order);

  return url;
};

const CoreService = {
  getRaw: (options = { url: '' }) =>
    new Promise((resolve, reject) =>
      fetch(options.url, {
        method: 'GET',
      })
        .then(async (res) => {
          return await res.text();
        })
        .then((res) => {
          // logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
  post: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          return await res.json();
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
  put: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'PUT',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          return await res.json();
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
  get: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(async (res) => {
          return await res.json();
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
  delete: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          return await res.json();
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
};

const ApiBase = getApiBaseUrl;

export {
  CoreService,
  headersFactory,
  payloadFactory,
  buildQueryUrl,
  getBaseHost,
  getApiBasePath,
  getApiBaseUrl,
  getWsBasePath,
  getWsBaseUrl,
  ApiBase,
};
