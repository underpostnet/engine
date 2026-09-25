import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'item-ledger-balance';

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

const token = ({ chainId, contractAddress, tokenId }) => `${chainId}/${contractAddress}/${tokenId}`;

class ItemLedgerBalanceService {
  /** The holders of one token type. */
  static getHolders = (options) =>
    read(buildQueryUrl(getApiBaseUrl({ id: `token/${token(options)}`, endpoint }), options).toString());

  /** What one address holds. */
  static getOwner = (options = { chainId: 0, contractAddress: '', ownerAddress: '' }) =>
    read(
      buildQueryUrl(
        getApiBaseUrl({ id: `owner/${options.chainId}/${options.contractAddress}/${options.ownerAddress}`, endpoint }),
        options,
      ).toString(),
    );

  /** Projected supply and holder count of one token type. */
  static getSupply = (options) => read(getApiBaseUrl({ id: `supply/${token(options)}`, endpoint }));
}

export { ItemLedgerBalanceService };
