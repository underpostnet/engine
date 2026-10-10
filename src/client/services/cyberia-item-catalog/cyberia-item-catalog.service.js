import { loggerFactory } from '../../components/core/Logger.js';
import { buildQueryUrl, getApiBaseUrl, headersFactory, payloadFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-item-catalog';

const request = (url, init = { method: 'GET' }) =>
  fetch(url, { ...init, headers: headersFactory(), credentials: 'include' })
    .then(readResponse)
    .catch((error) => {
      logger.error(error);
      throw error;
    });

const itemPath = (itemId, route = '') => `${encodeURIComponent(itemId)}${route ? `/${route}` : ''}`;

class CyberiaItemCatalogService {
  /** One binding (`id`), or a page of bindings with the state of each. */
  static get = (options = {}) =>
    request(buildQueryUrl(getApiBaseUrl({ id: options.id && itemPath(options.id), endpoint }), options).toString());

  /** The items a bind can add: a published definition and no binding. `q` matches a part of the id. */
  static getUnbound = ({ q = '' } = {}) => {
    const url = new URL(getApiBaseUrl({ id: 'unbound', endpoint }));
    if (q) url.searchParams.set('q', q);
    return request(url.toString());
  };

  /** The binding history of an item and every definition it could run. */
  static getHistory = ({ itemId }) => request(getApiBaseUrl({ id: itemPath(itemId, 'history'), endpoint }));

  /** How a definition of an item (`cid`, else the one it runs) is stored on IPFS. */
  static getDiagnostics = ({ itemId, cid = '' }) => {
    const url = new URL(getApiBaseUrl({ id: itemPath(itemId, 'diagnostics'), endpoint }));
    if (cid) url.searchParams.set('cid', cid);
    return request(url.toString());
  };

  /** Binds an item to a definition while it runs `expectedCid` (empty when unbound); 409 otherwise. */
  static bind = ({ itemId, objectLayerCid, expectedCid }) =>
    request(getApiBaseUrl({ endpoint }), {
      method: 'POST',
      body: payloadFactory({ itemId, objectLayerCid, expectedCid: expectedCid ?? '' }),
    });
}

export { CyberiaItemCatalogService };
