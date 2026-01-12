import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory } from '../core/core.service.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'file';

const FileService = {
  post: (options = { id: '', body: {}, headerId: 'file' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory('file'),
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          return await res.json();
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
  get: (options = { id: '' }) =>
    new Promise((resolve, reject) => {
      // Handle blob endpoint - fetch binary data directly
      if (options.id && options.id.startsWith('blob/')) {
        const blobId = options.id.substring(5); // Remove 'blob/' prefix
        fetch(getApiBaseUrl({ id: blobId, endpoint: 'file/blob' }), {
          method: 'GET',
          headers: headersFactory(),
          credentials: 'include',
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return await res.blob();
          })
          .then((blob) => {
            logger.info('Blob fetched successfully');
            return resolve({
              status: 'success',
              data: [blob],
            });
          })
          .catch((error) => {
            logger.error(error);
            return reject(error);
          });
      } else {
        // Handle regular metadata endpoint - fetch JSON
        fetch(getApiBaseUrl({ id: options.id, endpoint }), {
          method: 'GET',
          headers: headersFactory(),
          credentials: 'include',
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return await res.json();
          })
          .then((res) => {
            logger.info(res);
            return resolve(res);
          })
          .catch((error) => {
            logger.error(error);
            return reject(error);
          });
      }
    }),
  delete: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(async (res) => {
          return await res.json();
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

export { FileService };
