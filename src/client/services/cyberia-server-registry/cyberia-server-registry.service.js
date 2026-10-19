import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-server-registry';
const read = (id) =>
  new Promise((resolve, reject) =>
    fetch(getApiBaseUrl({ id, endpoint }), {
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
class CyberiaServerRegistryService {
  /** The logical endpoints of the live worlds. */
  static endpoints = () => read('');
  /** Every live game server process (moderator). */
  static servers = () => read('servers');
}
export { CyberiaServerRegistryService };
