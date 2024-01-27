import { endpointFactory } from '../../components/core/CommonJs.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/VanillaJs.js';

const logger = loggerFactory({ url: `${endpointFactory(import.meta)}-service` });

const proxyPath = getProxyPath();

const endpoint = endpointFactory(import.meta);

const API_BASE = () => `${window.location.protocol}//${location.host}${getProxyPath()}api${endpoint}`;

logger.info('Load service', API_BASE);

const CoreService = {
  getRaw: (url) =>
    new Promise((resolve, reject) =>
      fetch(url, {
        method: 'GET',
        // headers: {
        //   // 'Content-Type': 'application/json',
        //   // 'Authorization': ''
        // },
        // body,
      })
        .then(async (res) => {
          return await res.text();
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    ),
};

export { CoreService };
