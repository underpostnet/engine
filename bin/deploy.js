import fs from 'fs-extra';

import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Config } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

// usage
// node bin/deploy save-conf pm2-cyberia-3001
// node bin/deploy exec pm2-cyberia-3001

try {
  switch (operator) {
    case 'save':
      {
        const deployId = process.argv[3];
        const folder = `./engine-private/conf/${deployId}`;
        if (fs.existsSync(folder)) fs.removeSync(folder);
        await Config.build({ folder });
        fs.writeFileSync(`${folder}/.env.production`, fs.readFileSync('./.env.production', 'utf8'), 'utf8');
        fs.writeFileSync(`${folder}/package.json`, fs.readFileSync('./package.json', 'utf8'), 'utf8');
      }
      break;
    case 'run':
      {
        const deployId = process.argv[3];
        const folder = `./engine-private/conf/${deployId}`;
        if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
        for (const typeConf of Object.keys(Config.default))
          fs.writeFileSync(
            `./conf/conf.${typeConf}.json`,
            fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8'),
            'utf8',
          );
        fs.writeFileSync(`./.env.production`, fs.readFileSync(`${folder}/.env.production`, 'utf8'), 'utf8');
        fs.writeFileSync(`./package.json`, fs.readFileSync(`${folder}/package.json`, 'utf8'), 'utf8');
        shellExec('npm start');
        shellExec('git checkout .');
      }
      break;

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
