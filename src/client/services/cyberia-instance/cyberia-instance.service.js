import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-instance';
class CyberiaInstanceService {
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
  static get = (options = {}) => {
    const { id, page, limit, filterModel, sortModel, sort, asc, order, fallback } = options;
    const url = buildQueryUrl(getApiBaseUrl({ id, endpoint }), {
      page,
      limit,
      filterModel,
      sortModel,
      sort,
      asc,
      order,
    });
    // Opt-in: ask the API to append the always-on fallback (TEST) world.
    if (fallback) url.searchParams.set('fallback', 'true');
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
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
  };
  /** Trigger a world reload on a running cyberia-server (moderator/admin). */
  static hotReload = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${options.id}/hot-reload`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: JSON.stringify(options.body ?? {}),
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
  static portalConnect = (options = { id: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${options.id}/portal-connect`, endpoint }), {
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
  /** The maps of the Foundation and of each saga, each with whether this host stores it. */
  static getMapSources = () =>
    fetch(getApiBaseUrl({ id: 'map-sources', endpoint }), { headers: headersFactory(), credentials: 'include' })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
  /** What `{ mapCodes, portals }` connect, from the portal entities of the maps. */
  static getTopology = (options = { body: {} }) =>
    fetch(getApiBaseUrl({ id: 'topology', endpoint }), {
      method: 'POST',
      headers: headersFactory(),
      credentials: 'include',
      body: payloadFactory(options.body),
    })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
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
export { CyberiaInstanceService };
