import { endpointFactory } from '../../components/core/CommonJs.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getProxyPath } from '../../components/core/VanillaJs.js';

const logger = loggerFactory({ url: `${endpointFactory(import.meta)}-service` });

const proxyPath = getProxyPath();

const endpoint = endpointFactory(import.meta);

const API_BASE = `${window.location.protocol}//${location.host}${proxyPath}api${endpoint}`;

logger.info('Load service', API_BASE);

const UserService = {
  post: (body, uri = '') =>
    new Promise((resolve, reject) =>
      fetch(`${API_BASE}${uri}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': ''
        },
        body: JSON.stringify(body),
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
  get: (id = '', token) =>
    new Promise((resolve, reject) =>
      fetch(`${API_BASE}/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : undefined,
        },
        // body,
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
  delete: (id = '') =>
    new Promise((resolve, reject) =>
      fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': ''
        },
        // body: JSON.stringify(body),
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

export { UserService };
