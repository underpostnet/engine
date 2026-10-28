import { loggerFactory } from '../../components/core/Logger.js';
import { buildQueryUrl, getApiBaseUrl, headersFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-global-content';

const request = (url, init = { method: 'GET' }) =>
  fetch(url, { ...init, headers: headersFactory(), credentials: 'include' })
    .then(readResponse)
    .catch((error) => {
      logger.error(error);
      throw error;
    });

class CyberiaGlobalContentService {
  /** A page of global content: each definition with its item, its availability and the item ids bound to it. */
  static get = (options = {}) => request(buildQueryUrl(getApiBaseUrl({ endpoint }), options).toString());

  /** Removes a definition from global content, while no item and no player holds it. */
  static delete = ({ cid }) => request(getApiBaseUrl({ id: cid, endpoint }), { method: 'DELETE' });
}

export { CyberiaGlobalContentService };
