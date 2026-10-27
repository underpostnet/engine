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
/** Sends a request of an operator and reads its answer. */
const send = (path, method, body, timeout = 10000) =>
  fetch(getApiBaseUrl({ id: path, endpoint }), {
    method,
    headers: headersFactory(),
    credentials: 'include',
    signal: AbortSignal.timeout(timeout),
    ...(body !== undefined && { body: payloadFactory(body) }),
  })
    .then(readResponse)
    .catch((error) => {
      logger.error(error);
      throw error;
    });
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
    send(`${encodeURIComponent(options.id)}/session/end`, 'POST', options.body);
  /** The stacks of a profile, the open slots of its bag and storage, and its coins. */
  static getStacks = (options = { id: '' }) => send(`${encodeURIComponent(options.id)}/stacks`, 'GET');
  /** Changes the stacks of a profile: body {operationId, reason, epoch, change}. */
  static changeStacks = (options = { id: '', body: {} }) =>
    send(`${encodeURIComponent(options.id)}/stacks`, 'POST', options.body);
  /** Locks, bans or lifts the restriction of the account of a profile: body {operationId, reason, op, until?}. */
  static restrictAccount = (options = { id: '', body: {} }) =>
    send(`${encodeURIComponent(options.id)}/account`, 'POST', options.body);
  /** Runs or previews one operation on several profiles: body {batchId, targets, operation, reason, preview}. */
  static batch = (options = { body: {} }) => send('batch', 'POST', options.body, 60000);
}

export { CyberiaPlayerService };
