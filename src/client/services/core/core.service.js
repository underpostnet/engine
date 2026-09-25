/**
 * Core Service Client
 * Provides methods to interact and build URLs for the core API endpoints.
 * @module src/client/services/core/core.service.js
 * @namespace CoreServiceClient
 */
import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/Router.js';
import { GuestService } from '../user/guest.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'core';
// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
/**
 * Returns the normalized proxy path from renderPayload (always trailing `/`).
 * Falls back to `null` when no apiBaseProxyPath is set.
 * @memberof CoreServiceClient
 * @return {string|null}
 */
const getApiBaseProxyPath = () =>
  window.renderPayload?.apiBaseProxyPath
    ? window.renderPayload.apiBaseProxyPath === '/'
      ? window.renderPayload.apiBaseProxyPath
      : `${window.renderPayload.apiBaseProxyPath}/`
    : null;
/**
 * Gets the base host for API requests.
 * Uses the apiBaseHost from renderPayload if available, otherwise falls back to location.host.
 * @memberof CoreServiceClient
 * @return {string} The base host string.
 */
const getBaseHost = () => (window.renderPayload?.apiBaseHost ? window.renderPayload.apiBaseHost : location.host);
/**
 * The host that serves one endpoint: the owning domain when `renderPayload.apiHosts` names one
 * for it, else this client's API host.
 * @memberof CoreServiceClient
 * @param {string} [endpoint] - API endpoint name.
 * @return {string} The host string.
 */
const getEndpointHost = (endpoint) => window.renderPayload?.apiHosts?.[endpoint] || getBaseHost();
/**
 * Gets the base path for API requests: the proxy path, then the versioned API contract the
 * server names in `renderPayload.apiBasePath` (`api/v1`). The client holds no version of its own.
 * @memberof CoreServiceClient
 * @param {Object} [options] - Options for constructing the base path.
 * @param {string} [options.proxyPath] - Custom proxy path to use.
 * @return {string} The constructed API base path.
 */
const getApiBasePath = (options) =>
  `${options?.proxyPath ? `/${options.proxyPath}/` : getApiBaseProxyPath() || getProxyPath()}${window.renderPayload.apiBasePath}/`;
/**
 * Constructs the full API base URL for making requests.
 * Combines protocol, host, base path, endpoint, and optional ID.
 * @memberof CoreServiceClient
 * @param {Object} [options={}] - Options for constructing the URL.
 * @param {string} [options.id=''] - Optional resource ID to append to the URL.
 * @param {string} [options.endpoint=''] - API endpoint name.
 * @param {string} [options.proxyPath=''] - Custom proxy path to use.
 * @return {string} The full API base URL.
 */
const getApiBaseUrl = (options = { id: '', endpoint: '', proxyPath: '' }) =>
  `${location.protocol}//${getEndpointHost(options?.endpoint)}${getApiBasePath(options)}${options?.endpoint ? options.endpoint : ''}${options?.id ? `/${options.id}` : ''}`;
/**
 * Gets the base path for WebSocket connections.
 * Constructs the socket.io path using the proxy path.
 * @memberof CoreServiceClient
 * @return {string} The WebSocket base path.
 */
const getWsBasePath = () => {
  const proxyPath = getApiBaseProxyPath();
  if (proxyPath) return proxyPath !== '/' ? `${proxyPath}socket.io/` : '/socket.io/';
  return getProxyPath() !== '/' ? `${getProxyPath()}socket.io/` : '/socket.io/';
};
/**
 * Constructs the full WebSocket base URL for connections.
 * Uses wss: for HTTPS and ws: for HTTP protocols.
 * @memberof CoreServiceClient
 * @param {Object} [options={}] - Options for constructing the WebSocket URL.
 * @param {string} [options.id=''] - Optional resource ID to append to the URL.
 * @param {string} [options.endpoint=''] - WebSocket endpoint name.
 * @param {string} [options.wsBasePath=''] - Custom WebSocket base path to use.
 * @return {string} The full WebSocket base URL.
 */
const getWsBaseUrl = (options = { id: '', endpoint: '', wsBasePath: '' }) =>
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getBaseHost()}${options?.wsBasePath !== undefined ? options.wsBasePath : getWsBasePath()}${options?.endpoint ? options.endpoint : ''}${options?.id ? `/${options.id}` : ''}`;
/**
 * Creates HTTP headers for API requests.
 * Includes Authorization header with JWT token and Content-Type based on headerId.
 * @memberof CoreServiceClient
 * @param {string} [headerId=''] - Header type identifier. Use 'file' for file uploads (no Content-Type).
 * @return {Object} Headers object for fetch requests.
 */
const headersFactory = (headerId = '') => {
  const headers = {
    Authorization: GuestService.getAuthorizationHeader() || Auth.getJWT(),
  };
  switch (headerId) {
    case 'file':
      return headers;
    default:
      headers['Content-Type'] = 'application/json';
      return headers;
  }
};
/**
 * Prepares the request body payload for API requests.
 * Returns FormData as-is, otherwise stringifies the body as JSON.
 * @memberof CoreServiceClient
 * @param {Object|FormData} body - The request body to process.
 * @return {string|FormData} The processed payload ready for fetch.
 */
const payloadFactory = (body) => {
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
};
/**
 * Builds a URL with query parameters for pagination, filtering, and sorting.
 * Supports AG Grid filterModel/sortModel as well as legacy simple sort params.
 * @memberof CoreServiceClient
 * @param {string} baseUrl - The base API URL.
 * @param {Object} [options={}] - Query options.
 * @param {number} [options.page] - Page number for pagination.
 * @param {number} [options.limit] - Items per page for pagination.
 * @param {Object|string} [options.filterModel] - AG Grid filterModel (object or JSON string).
 * @param {Array|string} [options.sortModel] - AG Grid sortModel (array or JSON string).
 * @param {string} [options.sort] - Simple sort field (legacy).
 * @param {string|boolean} [options.asc] - Simple sort direction (legacy).
 * @param {string} [options.order] - Order string, e.g. "field1:asc,field2:desc" (legacy).
 * @return {URL} The URL object with query parameters set.
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
/**
 * The JSON body of a service answer. An answer that is not JSON never passes as content: an
 * edge or an outage answered in place of the API, and the error names the URL and the status
 * so the failure reads as a dependency failure, not as an empty result.
 * @memberof CoreServiceClient
 * @param {Response} res - The fetch response.
 * @return {Promise<Object>} The parsed body.
 * @throws {Error} When the body is not JSON; `error.status` carries the HTTP status.
 */
const readResponse = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(`${res.url} answered ${res.status} without a JSON body`);
    error.status = res.status;
    throw error;
  }
};
/**
 * Core Service object providing CRUD operations for the core API endpoint.
 * @memberof CoreServiceClient
 */
class CoreService {
  /**
   * Performs a raw GET request to fetch content as text.
   * @memberof CoreServiceClient.CoreService
   * @param {Object} [options={}] - Request options.
   * @param {string} [options.url=''] - The full URL to fetch.
   * @return {Promise<string>} A promise that resolves with the response text.
   */
  static getRaw = (options = { url: '' }) =>
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
    );
  /**
   * Performs a POST request to create a new resource.
   * @memberof CoreServiceClient.CoreService
   * @param {Object} [options={}] - Request options.
   * @param {string} [options.id=''] - Optional resource ID to append to the URL.
   * @param {Object} [options.body={}] - The request body payload.
   * @return {Promise<Object>} A promise that resolves with the JSON response.
   */
  static post = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /**
   * Performs a PUT request to update an existing resource.
   * @memberof CoreServiceClient.CoreService
   * @param {Object} [options={}] - Request options.
   * @param {string} [options.id=''] - The resource ID to update.
   * @param {Object} [options.body={}] - The request body payload with updated data.
   * @return {Promise<Object>} A promise that resolves with the JSON response.
   */
  static put = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'PUT',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /**
   * Performs a GET request to retrieve a resource.
   * @memberof CoreServiceClient.CoreService
   * @param {Object} [options={}] - Request options.
   * @param {string} [options.id=''] - Optional resource ID to retrieve.
   * @param {Object} [options.body={}] - Unused, kept for API consistency.
   * @return {Promise<Object>} A promise that resolves with the JSON response.
   */
  static get = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /**
   * Performs a DELETE request to remove a resource.
   * @memberof CoreServiceClient.CoreService
   * @param {Object} [options={}] - Request options.
   * @param {string} [options.id=''] - The resource ID to delete.
   * @param {Object} [options.body={}] - Optional request body payload.
   * @return {Promise<Object>} A promise that resolves with the JSON response.
   */
  static delete = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
}
/**
 * Alias for getApiBaseUrl function.
 * @memberof CoreServiceClient
 * @type {Function}
 */
const ApiBase = getApiBaseUrl;
export {
  CoreService,
  headersFactory,
  payloadFactory,
  readResponse,
  buildQueryUrl,
  getBaseHost,
  getEndpointHost,
  getApiBaseProxyPath,
  getApiBasePath,
  getApiBaseUrl,
  getWsBasePath,
  getWsBaseUrl,
  ApiBase,
};
