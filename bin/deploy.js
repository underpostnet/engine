import fs from 'fs-extra';

// import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Config } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

// usage
// node bin/deploy save-conf only-cyberia-3000

try {
  switch (operator) {
    case 'save-conf':
      {
        const deployId = process.argv[3];
        const folder = `./engine-private/conf/${deployId}`;
        if (fs.existsSync(folder)) fs.removeSync(folder);
        await Config.build({ folder });
        fs.writeFileSync(`${folder}/.env`, fs.readFileSync('./.env.production', 'utf8'), 'utf8');
        fs.writeFileSync(`${folder}/package.json`, fs.readFileSync('./package.json', 'utf8'), 'utf8');
      }
      break;

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
