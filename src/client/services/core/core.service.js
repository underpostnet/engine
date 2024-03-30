import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/VanillaJs.js';

const logger = loggerFactory(import.meta);

// https://developer.mozilla.org/en-US/docs/Web/API/AbortController

const getHost = () => `${location.hostname}${location.port ? `:${location.port}` : ''}${getProxyPath()}`;
const basePath = 'api/';
const ApiBase = (options = { id: '', endpoint: '' }) =>
  `${window.location.protocol}//${getHost()}${basePath}${options?.endpoint ? options.endpoint : ''}${
    options?.id ? `/${options.id}` : ''
  }`;

logger.info('Load service');

const endpoint = 'core';

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

export { CoreService, ApiBase, getHost };
