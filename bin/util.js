import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
import { shellExec } from '../src/server/process.js';
import { range } from '../src/client/components/core/CommonJs.js';
import { network } from '../src/server/network.js';
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
    case 'export-vs-extensions':
      shellExec(`code --list-extensions > vs-extensions.txt`);
      break;
    case 'kill-ports':
      if (!process.argv[3]) process.argv[3] = '22,80,443,3000-3020';
      for (const port of process.argv[3].split(',')) {
        const rangePort = port.split('-');
        if (rangePort[1])
          for (const port of range(parseInt(rangePort[0]), parseInt(rangePort[1]))) {
            logger.info('clean port', port);
            await network.port.portClean(port);
          }
        else {
          logger.info('clean port', parseInt(port));
          await network.port.portClean(port);
        }
      }
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
