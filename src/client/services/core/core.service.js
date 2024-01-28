import { endpointFactory } from '../../components/core/CommonJs.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/VanillaJs.js';

const logger = loggerFactory({ url: `${endpointFactory(import.meta)}-service` });

const ApiBase = (options = { id: '', endpoint: '' }) =>
  `${window.location.protocol}//${location.host}${getProxyPath()}api${options?.endpoint ? options.endpoint : ''}${
    options?.id ? `/${options.id}` : ''
  }`;

logger.info('Load service');

const CoreService = {
  getRaw: (options = { url: '' }) =>
    new Promise((resolve, reject) =>
      fetch(options.url, {
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

export { CoreService, ApiBase };
