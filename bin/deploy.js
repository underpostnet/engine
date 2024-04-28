import fs from 'fs-extra';
import axios from 'axios';
import ncp from 'copy-paste';
import read from 'read';

import { shellCd, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import {
  Config,
  addApiConf,
  buildApiSrc,
  buildClientSrc,
  cloneConf,
  loadConf,
  loadReplicas,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { range, setPad } from '../src/client/components/core/CommonJs.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

const deployTest = async (dataDeploy) => {
  const failed = [];
  for (const deploy of dataDeploy) {
    const serverConf = loadReplicas(
      JSON.parse(fs.readFileSync(`./engine-private/conf/${deploy.deployId}/conf.server.json`, 'utf8')),
    );
    let fail = false;
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        const urlTest = `https://${host}${path}`;
        try {
          const result = await axios.get(urlTest);
          const test = result.data.split('<title>');
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
    `node bin/deploy build-full-client${process.argv[4] === 'zip' ? '-zip' : ''} ${deploy.deployId} docs`,
  delete: (deploy) => `pm2 delete ${deploy.deployId}`,
  run: (deploy) => `node bin/deploy run ${deploy.deployId}`,
  copy: async (cmd) => {
    logger.info('cmd', cmd);
    await ncp.copy(cmd);
    await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  },
};

const deployRun = async (dataDeploy, reset) => {
  if (reset) fs.writeFileSync(`./tmp/runtime-router.json`, '{}', 'utf8');
  for (const deploy of dataDeploy) {
    await Cmd.copy(Cmd.delete(deploy));
    await Cmd.copy(Cmd.run(deploy));
  }
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
    case 'build-nodejs-conf-app':
      {
        const toOptions = { deployId: process.argv[3], clientId: process.argv[4] };
        const fromOptions = { deployId: process.argv[5], clientId: process.argv[6] };
        cloneConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-app':
      {
        const toOptions = { deployId: process.argv[3], clientId: process.argv[4] };
        const fromOptions = { deployId: process.argv[5], clientId: process.argv[6] };
        buildClientSrc({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-conf-api':
      {
        const toOptions = { apiId: process.argv[3], deployId: process.argv[4], clientId: process.argv[5] };
        const fromOptions = { apiId: process.argv[6], deployId: process.argv[7], clientId: process.argv[8] };
        addApiConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-api':
      {
        const toOptions = { apiId: process.argv[3], deployId: process.argv[4], clientId: process.argv[5] };
        const fromOptions = { apiId: process.argv[6], deployId: process.argv[7], clientId: process.argv[8] };
        buildApiSrc({ toOptions, fromOptions });
      }
      break;
    case 'run':
      {
        loadConf(process.argv[3]);
        shellExec(`npm start ${process.argv[3]}`);
      }
      break;
    case 'new-nodejs-app':
      {
        const deployId = process.argv[3];
        const clientId = process.argv[4];

        shellExec(`node bin/deploy build-nodejs-conf-app ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-nodejs-src-app ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-full-client ${deployId}`);

        shellExec(`npm run dev ${deployId}`);
      }
      break;
    case 'new-nodejs-api':
      {
        const apiId = process.argv[3];
        const deployId = process.argv[4];
        const clientId = process.argv[5];

        shellExec(`node bin/deploy build-nodejs-conf-api ${apiId} ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-nodejs-src-api ${apiId} ${deployId} ${clientId}`);

        shellExec(`npm run dev ${deployId}`);
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
            serverConf[host][path].minifyBuild = true;
          }
        }
        fs.writeFileSync(`./conf/conf.server.json`, JSON.stringify(serverConf, null, 4), 'utf-8');
        await buildClient();
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
    case 'prometheus':
    case 'prom':
      {
        const rangePort = [1, 20];
        const promConfigPath = `./engine-private/prometheus/prometheus-service-config.yml`;
        const rawConfig = fs
          .readFileSync(promConfigPath, 'utf8')
          .replaceAll(
            `['']`,
            JSON.stringify(range(...rangePort).map((i) => `host.docker.internal:30${setPad(i, '0', 2)}`)).replaceAll(
              `"`,
              `'`,
            ),
          );
        console.log(rawConfig);

        fs.writeFileSync(promConfigPath, rawConfig, 'utf8');

        await Cmd.copy(`docker-compose -f engine-private/prometheus/prometheus-service.yml up -d`);
      }
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
