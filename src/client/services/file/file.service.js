import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { ApiBase } from '../core/core.service.js';

const logger = loggerFactory(import.meta);

logger.info('Load service');

const endpoint = 'file';

const FileService = {
  post: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(ApiBase({ id: options.id, endpoint }), {
        method: 'POST',
        headers: {
          // 'Content-Type': 'multipart/form-data',
          Authorization: Auth.getJWT(),
        },
        body: options.body,
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
    new Promise((resolve, reject) =>
      fetch(ApiBase({ id: options.id, endpoint }), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: Auth.getJWT(),
        },
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
  delete: (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(ApiBase({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: Auth.getJWT(),
        },
        body: JSON.stringify(options.body),
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
