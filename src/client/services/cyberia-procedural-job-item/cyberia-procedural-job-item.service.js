import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-procedural-job-item';

class CyberiaProceduralJobItemService {
  /** One job item by its document id. */
  static get = (options = { id: '' }) =>
    fetch(getApiBaseUrl({ id: options.id, endpoint }), {
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

export { CyberiaProceduralJobItemService };
