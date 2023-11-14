import fs from 'fs-extra';
import merge from 'deepmerge';
import si from 'systeminformation';

import { loggerFactory } from '../src/server/logger.js';
import { shellExec } from '../src/server/process.js';
import { range } from '../src/client/components/core/CommonJs.js';
import { network } from '../src/server/network.js';
import { Config } from '../src/server/conf.js';
const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

try {
  // let cmd;
  switch (operator) {
    case 'cls':
      fs.removeSync('./public');
      fs.removeSync('./logs');
      fs.removeSync('./conf');
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
    case 'system-info':
      await (async () => {
        for (const infoKey of Object.keys(si)) {
          if (typeof si[infoKey] === 'function') {
            //  'dockerInfo', 'vboxInfo'
            if (!['osInfo', 'graphics', 'cpu'].includes(infoKey)) continue;
            try {
              const infoInstance = await si[infoKey]();
              logger.info(infoKey, infoInstance);
            } catch (error) {
              logger.info('Not valid info function', infoKey);
            }
          }
        }
      })();
      break;
    case 'update-client-conf':
      (() => {
        let origin = {};
        const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;
        if (!fs.existsSync(`./engine-private/conf`)) fs.mkdirSync(`./engine-private/conf`, { recursive: true });
        else origin = JSON.parse(fs.readFileSync('./engine-private/conf/conf.client.private.json', 'utf8'));
        fs.writeFileSync(
          './engine-private/conf/conf.client.private.json',
          JSON.stringify(merge(origin, Config.default.client, { arrayMerge: overwriteMerge }), null, 4),
          'utf8'
        );
      })();
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
