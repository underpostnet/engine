import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/CoreService.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-saga';
class CyberiaSagaService {
  /** The sagas of each code: `{ items, maps, quests, actions, dialogues }`. */
  static getSources = () =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: 'sources', endpoint }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /**
   * Previews the synchronization of a saga, or applies it with `apply`, the provider `selections` the
   * moderator chose and the `reviewed` revisions of the preview.
   */
  static sync = ({ code, apply = false, selections = [], reviewed = null }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `sync/${encodeURIComponent(code)}`, endpoint }), {
        method: apply ? 'POST' : 'GET',
        headers: headersFactory(),
        credentials: 'include',
        ...(apply && { body: payloadFactory({ selections, reviewed }) }),
      })
        .then(readResponse)
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /** A page of the saga catalog: `q`, `source`, `artifact`, `workspace`, `release`, `instance`, `workflow`, `page`, `limit`. */
  static catalog = (query = {}) => {
    const url = new URL(getApiBaseUrl({ id: 'catalog', endpoint }));
    for (const [key, value] of Object.entries(query))
      if (value !== '' && value != null) url.searchParams.set(key, value);
    return fetch(url.toString(), { method: 'GET', headers: headersFactory(), credentials: 'include' })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
  };
  /** The completeness report of a saga of the served content artifact. */
  static report = ({ code }) =>
    fetch(getApiBaseUrl({ id: `report/${encodeURIComponent(code)}`, endpoint }), {
      method: 'GET',
      headers: headersFactory(),
      credentials: 'include',
    })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
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
export { CyberiaSagaService };
