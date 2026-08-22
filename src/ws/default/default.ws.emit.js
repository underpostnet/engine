import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const DefaultWsEmit = (channel = '', client = {}, payload = {}) => {
  try {
    if (client && client.emit) client.emit(channel, JSON.stringify(payload));
    else logger.error('Invalid client', { channel, client, payload });
  } catch (error) {
    logger.error(error, { channel, client, payload, stack: error.stack });
  }
};

export { DefaultWsEmit };
