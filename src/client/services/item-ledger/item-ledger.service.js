import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'item-ledger';

const request = (url, init) =>
  new Promise((resolve, reject) =>
    fetch(url, { credentials: 'include', ...init })
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

class ItemLedgerService {
  /** Paginated bindings. */
  static get = (options = { id: '', page: 1, limit: 10 }) =>
    request(buildQueryUrl(getApiBaseUrl({ id: options.id, endpoint }), options).toString(), {
      method: 'GET',
      headers: headersFactory(),
    });

  /** Every binding of one Object Layer CID. */
  static getByCid = (options = { cid: '' }) =>
    request(getApiBaseUrl({ id: `cid/${options.cid}`, endpoint }), { method: 'GET', headers: headersFactory() });

  /** The binding of one on-chain token type. */
  static getByToken = (options = { chainId: 0, contractAddress: '', tokenId: '' }) =>
    request(getApiBaseUrl({ id: `token/${options.chainId}/${options.contractAddress}/${options.tokenId}`, endpoint }), {
      method: 'GET',
      headers: headersFactory(),
    });

  /** The token id a CID derives to. */
  static getTokenId = (options = { cid: '' }) =>
    request(getApiBaseUrl({ id: `token-id/${options.cid}`, endpoint }), { method: 'GET', headers: headersFactory() });

  /** Records a binding (admin). */
  static post = (options = { body: {}, headerId: undefined }) =>
    request(getApiBaseUrl({ id: '', endpoint }), {
      method: 'POST',
      headers: headersFactory(options.headerId),
      body: payloadFactory(options.body),
    });

  /** Removes a binding (admin). */
  static delete = (options = { id: '' }) =>
    request(getApiBaseUrl({ id: options.id, endpoint }), { method: 'DELETE', headers: headersFactory() });
}

export { ItemLedgerService };
