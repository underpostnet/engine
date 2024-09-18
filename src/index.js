import { loggerFactory } from './server/logger.js';

const logger = loggerFactory(import.meta);

const underpost = {
  setUpInfo: logger.setUpInfo,
};

export default underpost;
