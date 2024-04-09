import fs from 'fs-extra';
import axios from 'axios';
import ncp from 'copy-paste';
import read from 'read';

import { shellCd, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Config, loadConf } from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { timer } from '../src/client/components/core/CommonJs.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

const deployTest = async (dataDeploy) => {
  const failed = [];
  for (const deploy of dataDeploy) {
    const serverConf = JSON.parse(fs.readFileSync(`./engine-private/conf/${deploy.deployId}/conf.server.json`, 'utf8'));
    let fail = false;
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        const urlTest = `https://${host}${path}`;
        const result = await axios.get(urlTest);
        const test = result.data.split('<title>');
        try {
          if (test[1])
            logger.info('Success deploy', {
              ...deploy,
              result: test[1].split('</title>')[0],
              urlTest,
            });
          else {
            logger.error('Error deploy', {
              ...deploy,
              result: result.data,
              urlTest,
            });
            fail = true;
          }
        } catch (error) {
          logger.error('Error deploy', {
            ...deploy,
            message: error.message,
            urlTest,
          });
          fail = true;
        }
      }
    if (fail) failed.push(deploy);
  }
  return { failed };
};

const Cmd = {
  clientBuild: (deploy) =>
    `env-cmd -f .env.production node bin/deploy build-full-client${process.argv[4] === 'zip' ? '-zip' : ''} ${
      deploy.deployId
    } docs`,
  run: (deploy) => `pm2 delete ${deploy.deployId} && env-cmd -f .env.production node bin/deploy run ${deploy.deployId}`,
  copy: async (cmd) => {
    logger.info('cmd', cmd);
    await ncp.copy(cmd);
    await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  },
};

const deployRun = async (dataDeploy, reset) => {
  if (reset) fs.writeFileSync(`./tmp/runtime-router.json`, '{}', 'utf8');
  for (const deploy of dataDeploy) await Cmd.copy(Cmd.run(deploy));
  const { failed } = await deployTest(dataDeploy);
  for (const deploy of failed) logger.error(deploy.deployId, Cmd.run(deploy));
  if (failed.length > 0) await deployRun(failed);
};

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

    case 'run-macro':
      {
        const silent = true;
        shellExec(`git pull origin master`, { silent });
        shellCd(`engine-private`);
        shellExec(`git pull origin master`, { silent });
        shellCd(`..`);
        const dataDeploy = JSON.parse(fs.readFileSync(`./engine-private/deploy/${process.argv[3]}.json`, 'utf8')).map(
          (deployId) => {
            return {
              deployId,
            };
          },
        );
        await deployRun(dataDeploy, true);
      }
      break;

    case 'run-macro-build':
      {
        const silent = true;
        shellExec(`git pull origin master`, { silent });
        shellCd(`engine-private`);
        shellExec(`git pull origin master`, { silent });
        shellCd(`..`);
        const dataDeploy = JSON.parse(fs.readFileSync(`./engine-private/deploy/${process.argv[3]}.json`, 'utf8')).map(
          (deployId) => {
            return {
              deployId,
            };
          },
        );
        for (const deploy of dataDeploy) shellExec(Cmd.clientBuild(deploy), { silent });
        await deployRun(dataDeploy, true);
      }
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
