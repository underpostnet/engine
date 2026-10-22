import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-player-audit';
class CyberiaPlayerAuditService {
  /** One page of the operator trail of a profile, newest first: {player, after}. */
  static get = (options = {}) => {
    const { player, after } = options;
    const url = new URL(getApiBaseUrl({ endpoint }));
    url.searchParams.set('player', player);
    if (after) url.searchParams.set('after', after);
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
}

export { CyberiaPlayerAuditService };
