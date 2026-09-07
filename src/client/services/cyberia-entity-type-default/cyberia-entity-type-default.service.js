import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-entity-type-default';
class CyberiaEntityTypeDefaultService {
  static post = (options = { id: '', body: {} }) =>
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
    );
  static put = (options = { id: '', body: {} }) =>
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
    );
  static get = (options = {}) => {
    const { id, page, limit, filterModel, sortModel, sort, asc, order } = options;
    const url = buildQueryUrl(getApiBaseUrl({ id, endpoint }), {
      page,
      limit,
      filterModel,
      sortModel,
      sort,
      asc,
      order,
    });
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
  };
  static delete = (options = { id: '', body: {} }) =>
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
    );
  /** Points one instance's conf at every default the given maps place. */
  static syncInstance = (options = { instanceCode: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `sync-instance/${options.instanceCode}`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => await res.json())
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /** States the complete set of instances that reference this default. */
  static setInstances = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${options.id}/instances`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => await res.json())
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
export { CyberiaEntityTypeDefaultService };
