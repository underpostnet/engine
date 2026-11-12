import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, buildQueryUrl, readResponse } from '../core/CoreService.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-content-lifecycle-event';

/** The journal of a content lifecycle, newest event first. Read-only. */
class CyberiaContentLifecycleEventService {
  /** A page of the events of one cycle. */
  static get = ({ cycleId, page = 1, limit = 20 }) => {
    const url = buildQueryUrl(getApiBaseUrl({ endpoint }), { page, limit });
    url.searchParams.set('cycleId', cycleId);
    return fetch(url.toString(), { method: 'GET', headers: headersFactory(), credentials: 'include' })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
  };
}

export { CyberiaContentLifecycleEventService };
