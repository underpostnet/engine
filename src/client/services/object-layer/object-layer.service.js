import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory } from '../core/core.service.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'object-layer';

const ObjectLayerService = {
  post: (options = { id: '', body: {}, headerId: undefined }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(options.headerId),
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
  put: (options = { id: '', body: {}, headerId: undefined }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'PUT',
        headers: headersFactory(options.headerId),
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
  get: (options = { id: '', body: {} }) => {
    const url = new URL(getApiBaseUrl({ id: options.id, endpoint }));
    if (options.page) url.searchParams.set('page', options.page);
    if (options.limit) url.searchParams.set('limit', options.limit);
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
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
    );
  },
  getRender: (options = { id: '' }) => {
    const url = new URL(getApiBaseUrl({ id: `render/${options.id}`, endpoint }));
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
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
    );
  },
  getMetadata: (options = { id: '' }) => {
    const url = new URL(getApiBaseUrl({ id: `metadata/${options.id}`, endpoint }));
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
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
    );
  },
  getFrameCounts: (options = { id: '' }) => {
    const url = new URL(getApiBaseUrl({ id: `frame-counts/${options.id}`, endpoint }));
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
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
    );
  },
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
  generateWebp: (options = { itemType: '', itemId: '', directionCode: '' }) => {
    const url = new URL(
      getApiBaseUrl({
        id: `generate-webp/${options.itemType}/${options.itemId}/${options.directionCode}`,
        endpoint,
      }),
    );
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Failed to generate WebP');
          }
          // Get the blob data
          const blob = await res.blob();
          // Create a blob URL for display
          const blobUrl = URL.createObjectURL(blob);
          return { status: 'success', data: blobUrl };
        })
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  },
};

export { ObjectLayerService };
