import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory } from '../core/core.service.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'document';

const DocumentService = {
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
  get: (options = { id: '' }) =>
    new Promise((resolve, reject) => {
      const url = new URL(getApiBaseUrl({ id: options.id, endpoint }));
      if (options.params) {
        Object.keys(options.params).forEach((key) => url.searchParams.append(key, options.params[key]));
      }
      fetch(url, {
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
        });
    }),
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
};

export { DocumentService };
