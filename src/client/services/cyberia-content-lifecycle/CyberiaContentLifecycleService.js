import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, buildQueryUrl, readResponse } from '../core/CoreService.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-content-lifecycle';

/** The content lifecycles this engine reaches: a page of summaries, the plan of one cycle, and the monitor context. Read-only. */
class CyberiaContentLifecycleService {
  /** Where this engine reads the cycles, the state of its share and its Development Sandbox. */
  static runtime = () =>
    fetch(getApiBaseUrl({ id: 'runtime', endpoint }), {
      method: 'GET',
      headers: headersFactory(),
      credentials: 'include',
    })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });

  /** A page of cycle summaries (`page`, `limit`), or the plan of one cycle (`id`). */
  static get = ({ id, page, limit } = {}) =>
    fetch(buildQueryUrl(getApiBaseUrl({ id, endpoint }), { page, limit }).toString(), {
      method: 'GET',
      headers: headersFactory(),
      credentials: 'include',
    })
      .then(readResponse)
      .catch((error) => {
        logger.error(error);
        throw error;
      });
}

export { CyberiaContentLifecycleService };
