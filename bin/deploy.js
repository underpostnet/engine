import fs from 'fs-extra';

import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Config, loadConf } from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';

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
        fs.writeFileSync(`${folder}/.env.development`, fs.readFileSync('./.env.development', 'utf8'), 'utf8');
        fs.writeFileSync(`${folder}/.env.test`, fs.readFileSync('./.env.test', 'utf8'), 'utf8');
        fs.writeFileSync(`${folder}/package.json`, fs.readFileSync('./package.json', 'utf8'), 'utf8');
      }
      break;
    case 'run':
      {
        loadConf(process.argv[3]);
        shellExec('npm start');
        shellExec('git checkout .');
      }
      break;
    case 'build-full-client-zip':
    case 'build-full-client':
      {
        const { deployId, folder } = loadConf(process.argv[3]);
        const serverConf = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
        for (const host of Object.keys(serverConf)) {
          for (const path of Object.keys(serverConf[host])) {
            serverConf[host][path].lightBuild = false;
          }
        }
        fs.writeFileSync(`./conf/conf.server.json`, JSON.stringify(serverConf, null, 4), 'utf-8');
        await buildClient();
        // shellExec(`pm2 delete ${deployId}`);
        // shellExec('git checkout .');
      }
      break;

    case 'sync-package':
      const files = await fs.readdir(`./engine-private/conf`, { recursive: true });
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      for (const relativePath of files) {
        const filePah = `./engine-private/conf/${relativePath.replaceAll(`\\`, '/')}`;
        if (filePah.split('/').pop() === 'package.json') {
          originPackage.scripts.start = JSON.parse(fs.readFileSync(filePah), 'utf8').scripts.start;
          fs.writeFileSync(filePah, JSON.stringify(originPackage, null, 4), 'utf8');
        }
      }
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
