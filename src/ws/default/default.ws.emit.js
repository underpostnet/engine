import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const DefaultWsEmit = (channel = '', client = {}, payload = {}) => {
  try {
    client.emit(channel, JSON.stringify(payload));
  } catch (error) {
    logger.error(error, error.stack);
  }
};

export { DefaultWsEmit };
