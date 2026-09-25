import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'wallet-account';

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

class WalletAccountService {
  /** The SIWE challenge to sign: nonce, domain, chain and the exact message text. */
  static challenge = (options = { body: {} }) =>
    request(getApiBaseUrl({ id: 'challenge', endpoint }), {
      method: 'POST',
      headers: headersFactory(),
      body: payloadFactory(options.body),
    });

  /** Proves the address and opens a session. */
  static signIn = (options = { body: {} }) =>
    request(getApiBaseUrl({ id: 'sign-in', endpoint }), {
      method: 'POST',
      headers: headersFactory(),
      body: payloadFactory(options.body),
    });

  /** The public record of one account. */
  static get = (options = { id: '' }) =>
    request(getApiBaseUrl({ id: options.id, endpoint }), { method: 'GET', headers: headersFactory() });
}

export { WalletAccountService };
