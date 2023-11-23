import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { get, post } from './controller.js';

const ApiRouter = (app, path = '') => {
  const logger = loggerFactory(import.meta);
  const endpoint = endpointFactory(import.meta, path);
  logger.info('endpoint', endpoint);
  app.post(endpoint, post);
  app.get(endpoint, get);
};

export { ApiRouter };
