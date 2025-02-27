import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

class UnderpostDB {
  static API = {
    async import(options = { import: 'default' }) {
      for (const _deployId of options.import.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        logger.info('', { deployId });
      }
    },
  };
}

export default UnderpostDB;
