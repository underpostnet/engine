import { endpointFactory } from '../../components/core/CommonJs.js';
import { loggerFactory } from '../../components/core/Logger.js';

const logger = loggerFactory({ url: `${endpointFactory(import.meta)}-service` });

const DEV_API_BASE = `http://${location.host}${endpointFactory(import.meta)}`;

const FileService = {
  post: (body) =>
    new Promise((resolve, reject) =>
      fetch(DEV_API_BASE, {
        method: 'POST',
        // headers: {
        //   // 'Content-Type': 'application/json',
        //   // 'Authorization': ''
        // },
        body,
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
        })
    ),
};

export { FileService };
