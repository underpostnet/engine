import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-player';

/** The URL of a read with the query parameters that carry a value. */
const queryUrl = (id, query) => {
  const url = new URL(getApiBaseUrl({ id, endpoint }));
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  return url;
};
class CyberiaPlayerService {
  /** The detail of one profile ({id}), or one page of profiles ({q, universeCode, status, after, limit}). */
  static get = (options = {}) => {
    const { id, q, universeCode, status, after, limit } = options;
    const url = queryUrl(id, { q, universeCode, status, after, limit });
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
  /** Ends the live session of a profile: body {operationId, reason, epoch}. */
  static endSession = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: `${encodeURIComponent(options.id)}/session/end`, endpoint }), {
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
}

export { CyberiaPlayerService };
