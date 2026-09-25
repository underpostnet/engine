import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'item-ledger-transfer';

const read = (url) =>
  new Promise((resolve, reject) =>
    fetch(url, { method: 'GET', headers: headersFactory(), credentials: 'include' })
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

class ItemLedgerTransferService {
  /** The provenance of one token type, in chain order. */
  static getProvenance = (options = { chainId: 0, contractAddress: '', tokenId: '', page: 1, limit: 10 }) =>
    read(
      buildQueryUrl(
        getApiBaseUrl({ id: `token/${options.chainId}/${options.contractAddress}/${options.tokenId}`, endpoint }),
        options,
      ).toString(),
    );

  /** Every leg one address sent or received. */
  static getOwner = (options = { chainId: 0, contractAddress: '', ownerAddress: '', page: 1, limit: 10 }) =>
    read(
      buildQueryUrl(
        getApiBaseUrl({ id: `owner/${options.chainId}/${options.contractAddress}/${options.ownerAddress}`, endpoint }),
        options,
      ).toString(),
    );
}

export { ItemLedgerTransferService };
