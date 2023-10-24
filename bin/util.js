import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

try {
  // let cmd;
  switch (operator) {
    case 'cls':
      fs.removeSync('./public');
      fs.removeSync('./logs');
      //   fs.removeSync('./conf');
      //   fs.removeSync('./engine-private');
      //   fs.removeSync('./node_modules');
      break;
    case 'log':
      (() => {
        const logPath = `./logs/${process.argv[3]}/${process.argv[4]}.log`;
        logger.info('Read', logPath);
        console.log(fs.readFileSync(logPath, 'utf8'));
      })();
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
