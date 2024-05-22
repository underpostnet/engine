import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const CyberiaWsEmit = (channel = '', client = {}, payload = {}) => {
  try {
    client.emit(channel, JSON.stringify(payload));
  } catch (error) {
    logger.error(error, error.stack);
  }
};

export { CyberiaWsEmit };
