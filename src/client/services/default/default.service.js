import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory } from '../core/core.service.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'default';

const DefaultService = {
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
  get: (options = {}) => {
    const { id, page, limit, filterModel, sortModel, sort, asc } = options;
    const url = new URL(getApiBaseUrl({ id, endpoint }));

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

    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
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
    );
  },
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

export { DefaultService };
