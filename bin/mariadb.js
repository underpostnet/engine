// import fs from 'fs';
// import read from 'read';
// import ncp from 'copy-paste';

// import { getRootDirectory } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

try {
  let cmd;
  switch (operator) {
    case 'show':
      break;

    default:
      break;
  }
  // throw new Error(`host not found: ${host}`);
  // logger.info(`run the following command for renewal. Command copy to clipboard`, cmd);
  // logger.info(`success install SLL`, hosts);
} catch (error) {
  logger.error(error);
}
