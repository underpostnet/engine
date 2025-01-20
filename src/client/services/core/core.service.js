import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/VanillaJs.js';

const logger = loggerFactory(import.meta);

// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
const getBaseHost = () => location.host;

const getApiBasePath = () => `${getProxyPath()}api/`;

const getApiBaseUrl = (options = { id: '', endpoint: '' }) =>
  `${location.protocol}//${getBaseHost()}${getApiBasePath()}${options?.endpoint ? options.endpoint : ''}${
    options?.id ? `/${options.id}` : ''
  }`;

const getWsBasePath = () => (getProxyPath() !== '/' ? `${getProxyPath()}socket.io/` : undefined);

const getWsBaseUrl = (options = { id: '', endpoint: '', wsBasePath: '' }) =>
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getBaseHost()}${
    options?.wsBasePath !== undefined ? options.wsBasePath : getWsBasePath()
  }${options?.endpoint ? options.endpoint : ''}${options?.id ? `/${options.id}` : ''}`;

const headersFactory = (headerId = '') => {
  const headers = { Authorization: Auth.getJWT() }; // , mode: 'no-cors'
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

logger.info('Load service');

const endpoint = 'core';
const _VERSION = window._VERSION;

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
  getRandomImage: (options = { category: ['city'], mimetype: 'image/jpg' }) => {
    const src = `https://api.api-ninjas.com/v1/randomimage?category=${options.category[0]}`;
    return new Promise((resolve) => {
      fetch(src, {
        headers: { 'X-Api-Key': 'FyITmcxRXkCaUehbX6K0/g==uxZcFKL0dZUUg48G', Accept: options.mimetype },
      })
        .then((res) => res.blob())
        .then(async (blob) => {
          return resolve({
            file: {
              mimetype: 'image/jpg',
              name: 'image.jpg',
            },
            url: URL.createObjectURL(blob),
          });
        });
    });
  },
  post: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
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
  _VERSION,
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
