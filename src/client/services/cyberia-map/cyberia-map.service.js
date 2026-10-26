import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-map';
class CyberiaMapService {
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
  /** Draws the preview of the revision a map is at now, and answers its media. */
  static media = (options = { id: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${options.id}/media`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory({}),
      })
        .then(readResponse)
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /** The foundation context of a map against its stored entities. */
  /** The preview state of the revision a map is at: `{ media, preview }`. */
  static readMedia = (options = { id: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${options.id}/media`, endpoint }), {
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

  /** URL of the preview of a stored map, drawn once when it has none. */
  static previewUrl = (code) => getApiBaseUrl({ id: `${encodeURIComponent(code)}/preview`, endpoint });

  /**
   * Draws a map an editor holds, saved or not; nothing is stored. Resolves with a Blob of the PNG, or
   * null when the map draws nothing.
   */
  static draftPreview = (options = { body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: 'draft-preview', endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          if (res.status === 204) return null;
          if (!res.ok) throw new Error((await readResponse(res)).message ?? `draft preview failed: ${res.status}`);
          return await res.blob();
        })
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );

  static getContext = (options = { code: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `context/${encodeURIComponent(options.code)}`, endpoint }), {
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
  static searchCodes = (options = { q: '' }) => {
    const url = new URL(getApiBaseUrl({ id: 'search-codes', endpoint }));
    if (options.q) url.searchParams.set('q', options.q);
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then((res) => {
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  };
}
export { CyberiaMapService };
