import { loggerFactory } from './server/logger.js';

const logger = loggerFactory(import.meta);

const underpost = {
  setUpInfo: logger.setUpInfo,
};

const up = underpost;

export { underpost, up };

export default underpost;
