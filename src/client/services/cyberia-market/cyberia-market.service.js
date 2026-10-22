import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-market';
class CyberiaMarketService {
  static post = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
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
        signal: AbortSignal.timeout(10000),
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
        signal: AbortSignal.timeout(10000),
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
  /** A market profile with the terminals that open it and the markets they resolve to. */
  static view = (options = { code: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${encodeURIComponent(options.code)}/view`, endpoint }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
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
  /** The fields, bounds and defaults of a market profile and of a terminal. */
  static contract = () =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: 'schema/contract', endpoint }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
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
  /** A copy of a market profile, with no listing: body {code, name}. */
  static clone = (options = { code: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${encodeURIComponent(options.code)}/clone`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
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
  /** Asks the running worlds that open a market profile to reload its terms. */
  static reload = (options = { code: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${encodeURIComponent(options.code)}/reload`, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(60000),
        body: payloadFactory({}),
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
  static delete = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
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
export { CyberiaMarketService };
