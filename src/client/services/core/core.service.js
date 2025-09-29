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
      ? window.renderPayload.apiBaseProxyPath
      : getProxyPath()
  }${window.renderPayload?.apiBasePath ? window.renderPayload.apiBasePath : 'api'}/`;

const getApiBaseUrl = (options = { id: '', endpoint: '', proxyPath: '' }) =>
  `${location.protocol}//${getBaseHost()}${getApiBasePath(options)}${options?.endpoint ? options.endpoint : ''}${
    options?.id ? `/${options.id}` : ''
  }`;

const getWsBasePath = () => (getProxyPath() !== '/' ? `${getProxyPath()}socket.io/` : undefined);

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
  getBaseHost,
  getApiBasePath,
  getApiBaseUrl,
  getWsBasePath,
  getWsBaseUrl,
  ApiBase,
};
