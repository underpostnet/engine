import fs from 'fs-extra';
import axios from 'axios';
import ncp from 'copy-paste';
import read from 'read';
import dotenv from 'dotenv';
import plantuml from 'plantuml';

import { shellCd, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import {
  Config,
  addApiConf,
  addClientConf,
  buildApiSrc,
  buildClientSrc,
  cloneConf,
  loadConf,
  loadReplicas,
  addWsConf,
  buildWsSrc,
  cloneSrcComponents,
  cliSpinner,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { range, setPad, timer } from '../src/client/components/core/CommonJs.js';
import toJsonSchema from 'to-json-schema';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

const deployTest = async (dataDeploy) => {
  const failed = [];
  for (const deploy of dataDeploy) {
    const deployServerConfPath = fs.existsSync(`./engine-private/replica/${deploy.deployId}/conf.server.json`)
      ? `./engine-private/replica/${deploy.deployId}/conf.server.json`
      : `./engine-private/conf/${deploy.deployId}/conf.server.json`;
    const serverConf = loadReplicas(JSON.parse(fs.readFileSync(deployServerConfPath, 'utf8')));
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
    `node bin/deploy build-full-client${process.argv[4] === 'zip' ? '-zip' : ''} ${deploy.deployId}${
      process.argv.includes('docs') ? ' docs' : ''
    }`,
  delete: (deploy) => `pm2 delete ${deploy.deployId}`,
  run: (deploy) => `node bin/deploy run ${deploy.deployId}`,
  exec: async (cmd, deployId) => {
    if (process.argv[4] === 'copy') {
      await ncp.copy(cmd);
      await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      if (!fs.existsSync(`./tmp/await-deploy`)) return true;
      return false;
    } else {
      shellExec(cmd);
      return await new Promise(async (resolve) => {
        const maxTime = 1000 * 60 * 5;
        const minTime = 10000 * 2;
        const intervalTime = 1000;
        let currentTime = 0;
        const attempt = () => {
          if (currentTime >= minTime && !fs.existsSync(`./tmp/await-deploy`)) {
            clearInterval(processMonitor);
            return resolve(true);
          }
          cliSpinner(
            intervalTime,
            `[deploy.js] `,
            ` Load instance | elapsed time ${currentTime / 1000}s / ${maxTime / 1000}s`,
            'yellow',
            'material',
          );
          currentTime += intervalTime;
          if (currentTime === maxTime) return resolve(false);
        };
        const processMonitor = setInterval(attempt, intervalTime);
      });
    }
  },
};

const deployRun = async (dataDeploy, reset) => {
  if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`, { recursive: true });
  if (reset) fs.writeFileSync(`./tmp/runtime-router.json`, '{}', 'utf8');
  for (const deploy of dataDeploy) {
    const deployRunAttempt = async () => {
      await Cmd.exec(Cmd.delete(deploy));
      const execResult = await Cmd.exec(Cmd.run(deploy));
      if (!execResult) {
        logger.error('Deploy time out deploy restart', { dataDeploy, reset });
        await deployRunAttempt();
      }
    };
    await deployRunAttempt();
  }
  const { failed } = await deployTest(dataDeploy);
  for (const deploy of failed) logger.error(deploy.deployId, Cmd.run(deploy));
  if (failed.length > 0) {
    process.argv[4] = 'copy';
    await deployRun(failed);
  }
};

const getDataDeploy = (options = { buildSingleReplica: false }) => {
  let dataDeploy = JSON.parse(fs.readFileSync(`./engine-private/deploy/${process.argv[3]}.json`, 'utf8')).map(
    (deployId) => {
      return {
        deployId,
      };
    },
  );

  if (options && options.buildSingleReplica && fs.existsSync(`./engine-private/replica`))
    fs.removeSync(`./engine-private/replica`);

  let buildDataDeploy = [];
  for (const deployObj of dataDeploy) {
    const serverConf = loadReplicas(
      JSON.parse(fs.readFileSync(`./engine-private/conf/${deployObj.deployId}/conf.server.json`, 'utf8')),
    );
    let replicaDataDeploy = [];
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        if (serverConf[host][path].replicas && serverConf[host][path].singleReplica) {
          if (options && options.buildSingleReplica)
            shellExec(`node bin/deploy build-single-replica ${deployObj.deployId} ${host} ${path}`);
          replicaDataDeploy = replicaDataDeploy.concat(
            serverConf[host][path].replicas.map((r) => {
              return {
                deployId: `${deployObj.deployId}-${r.slice(1)}`,
                replicaHost: host,
              };
            }),
          );
        }
      }
    buildDataDeploy.push(deployObj);
    if (replicaDataDeploy.length > 0) buildDataDeploy = buildDataDeploy.concat(replicaDataDeploy);
  }

  logger.info('buildDataDeploy', buildDataDeploy);
  return buildDataDeploy;
};

const updateSrc = () => {
  const silent = true;
  shellExec(`git pull origin master`, { silent });
  shellCd(`engine-private`);
  shellExec(`git pull origin master`, { silent });
  shellCd(`..`);
  // shellExec(`npm install && npm install --only=dev`);
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
    case 'add-nodejs-app-client-conf':
      {
        const toOptions = {
          deployId: process.argv[3],
          clientId: process.argv[4],
          host: process.argv[5],
          path: process.argv[6],
        };
        const fromOptions = { deployId: process.argv[7], clientId: process.argv[8] };
        addClientConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-conf-app':
      {
        const toOptions = { deployId: process.argv[3], clientId: process.argv[4] };
        const fromOptions = { deployId: process.argv[5], clientId: process.argv[6] };
        cloneConf({ toOptions, fromOptions });
      }
      break;
    case 'clone-nodejs-src-client-components':
      {
        const fromOptions = { componentsFolder: process.argv[3] };
        const toOptions = { componentsFolder: process.argv[4] };
        cloneSrcComponents({ toOptions, fromOptions });
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
    case 'build-nodejs-conf-ws':
      {
        const toOptions = {
          wsId: process.argv[3],
          deployId: process.argv[4],
          host: process.argv[5],
          paths: process.argv[6],
        };
        const fromOptions = {
          wsId: process.argv[7],
          deployId: process.argv[8],
          host: process.argv[9],
          paths: process.argv[10],
        };
        addWsConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-ws':
      {
        const toOptions = {
          wsId: process.argv[3],
          deployId: process.argv[4],
          host: process.argv[5],
          paths: process.argv[6],
        };
        const fromOptions = {
          wsId: process.argv[7],
          deployId: process.argv[8],
          host: process.argv[9],
          paths: process.argv[10],
        };
        buildWsSrc({ toOptions, fromOptions });
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
    case 'test-new-api':
      {
        const port = process.argv[3];
        const apiId = process.argv[4];
        let url = `http://localhost:${port}/api/${apiId}`;
        {
          logger.info(`POST REQUEST`, url);
          const result = await axios.post(url, {});
          url += '/' + result.data.data._id;
          logger.info(`POST RESULT ${url}`, result.data);
        }
        {
          logger.info(`GET REQUEST`, url);
          const result = await axios.get(url);
          logger.info(`GET RESULT ${url}`, result.data);
        }
        {
          logger.info(`DELETE REQUEST`, url);
          const result = await axios.delete(url);
          logger.info(`DELETE RESULT ${url}`, result.data);
        }
      }
      break;
    case 'new-nodejs-api':
      {
        const apiId = process.argv[3];
        const deployId = process.argv[4];
        const clientId = process.argv[5];

        shellExec(`node bin/deploy build-nodejs-conf-api ${apiId} ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-nodejs-src-api ${apiId} ${deployId} ${clientId}`);

        // shellExec(`npm run dev ${deployId}`);
      }
      break;
    case 'new-nodejs-ws':
      {
        const wsId = process.argv[3];
        const deployId = process.argv[4];
        const host = process.argv[5];
        const paths = process.argv[6];

        shellExec(`node bin/deploy build-nodejs-conf-ws ${wsId} ${deployId} ${host} ${paths}`);

        shellExec(`node bin/deploy build-nodejs-src-ws ${wsId} ${deployId} ${host} ${paths}`);

        shellExec(`npm run dev ${deployId}`);
      }
      break;
    case 'build-full-client-zip':
    case 'build-full-client':
      {
        const { deployId, folder } = loadConf(process.argv[3]);

        let argHost = process.argv[4] ? process.argv[4].split(',') : undefined;
        let argPath = process.argv[5] ? process.argv[5].split(',') : undefined;
        const serverConf = deployId
          ? JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'))
          : Config.default.server;
        if (!deployId) {
          argHost = 'default.net';
          argPath = '/';
        }
        for (const host of Object.keys(serverConf)) {
          for (const path of Object.keys(serverConf[host])) {
            if (argHost && argPath && (!argHost.includes(host) || !argPath.includes(path))) {
              delete serverConf[host][path];
            } else {
              serverConf[host][path].lightBuild = process.argv.includes('l') ? true : false;
              serverConf[host][path].minifyBuild = process.env.NODE_ENV === 'production' ? true : false;
            }
          }
        }
        fs.writeFileSync(`./conf/conf.server.json`, JSON.stringify(serverConf, null, 4), 'utf-8');
        await buildClient();
      }
      break;

    case 'update-package':
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
        if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
        updateSrc();
        const dataDeploy = getDataDeploy({ buildSingleReplica: true });
        shellExec(`node bin/deploy sync-env-port ${process.argv[3]}`);
        await deployRun(dataDeploy, true);
      }
      break;

    case 'run-macro-build':
      {
        if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
        updateSrc();
        const dataDeploy = getDataDeploy({ buildSingleReplica: true });
        shellExec(`node bin/deploy sync-env-port ${process.argv[3]}`);
        for (const deploy of dataDeploy) shellExec(Cmd.clientBuild(deploy), { silent: true });
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

        await Cmd.exec(`docker-compose -f engine-private/prometheus/prometheus-service.yml up -d`);
      }
      break;

    case 'sync-env-port':
      const dataDeploy = getDataDeploy();
      const dataEnv = [
        { env: 'production', port: 3000 },
        { env: 'development', port: 4000 },
        { env: 'test', port: 5000 },
      ];
      let port = 0;
      const singleReplicaHosts = [];
      for (const deployIdObj of dataDeploy) {
        const { deployId, replicaHost } = deployIdObj;
        if (replicaHost && !singleReplicaHosts.includes(replicaHost)) singleReplicaHosts.push(replicaHost);
        const proxyInstance = deployId.match('proxy') || deployId.match('dns');
        const baseConfPath = fs.existsSync(`./engine-private/replica/${deployId}`)
          ? `./engine-private/replica`
          : `./engine-private/conf`;
        for (const envInstanceObj of dataEnv) {
          const envPath = `${baseConfPath}/${deployId}/.env.${envInstanceObj.env}`;
          const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
          envObj.PORT = proxyInstance
            ? envInstanceObj.port
            : envInstanceObj.port + port - singleReplicaHosts.length - (replicaHost ? 1 : 0);

          fs.writeFileSync(
            envPath,
            Object.keys(envObj)
              .map((key) => `${key}=${envObj[key]}`)
              .join(`\n`),
            'utf8',
          );
        }
        const serverConf = loadReplicas(
          JSON.parse(fs.readFileSync(`${baseConfPath}/${deployId}/conf.server.json`, 'utf8')),
        );
        if (!proxyInstance) for (const host of Object.keys(serverConf)) port += Object.keys(serverConf[host]).length;
      }
      break;

    case 'build-uml':
      {
        // comment:
        // '--add-opens=java.xml/com.sun.org.apache.xalan.internal.xsltc.trax="ALL-UNNAMED"'
        // in plantuml.js src

        const deployId = process.argv[3];
        const clientId = process.argv[4];
        const folder = `./src/client/public/${clientId ? clientId : 'default'}/plantuml`;
        const confData = !deployId
          ? Config.default
          : {
              client: '',
              ssr: '',
              server: '',
              dns: '',
            };

        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        for (const typeConf of Object.keys(confData)) {
          {
            const svg = await plantuml(`
              @startjson
                ${JSON.stringify(confData[typeConf])}
              @endjson
            `);
            fs.writeFileSync(`${folder}/${typeConf}-conf-default.svg`, svg);
          }
          {
            const svg = await plantuml(`
            @startjson
              ${JSON.stringify(toJsonSchema(confData[typeConf]))}
            @endjson
          `);
            fs.writeFileSync(`${folder}/${typeConf}-schema-default.svg`, svg);
          }
        }
      }
      break;

    case 'build-single-replica': {
      const deployId = process.argv[3];
      const host = process.argv[4];
      const path = process.argv[5];
      const serverConf = loadReplicas(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
      );

      if (serverConf[host][path].replicas) {
        {
          let replicaIndex = -1;
          for (const replica of serverConf[host][path].replicas) {
            replicaIndex++;
            const replicaDeployId = `${deployId}-${serverConf[host][path].replicas[replicaIndex].slice(1)}`;
            // fs.mkdirSync(`./engine-private/replica/${deployId}${replicaIndex}`, { recursive: true });
            await fs.copy(`./engine-private/conf/${deployId}`, `./engine-private/replica/${replicaDeployId}`);
            fs.writeFileSync(
              `./engine-private/replica/${replicaDeployId}/package.json`,
              fs
                .readFileSync(`./engine-private/replica/${replicaDeployId}/package.json`, 'utf8')
                .replaceAll(`--name ${deployId}`, `--name ${replicaDeployId}`),
              'utf8',
            );
          }
        }
        {
          let replicaIndex = -1;
          for (const replica of serverConf[host][path].replicas) {
            replicaIndex++;
            const replicaDeployId = `${deployId}-${serverConf[host][path].replicas[replicaIndex].slice(1)}`;
            let replicaServerConf = JSON.parse(
              fs.readFileSync(`./engine-private/replica/${replicaDeployId}/conf.server.json`, 'utf8'),
            );

            const singleReplicaConf = replicaServerConf[host][path];
            singleReplicaConf.replicas = undefined;
            singleReplicaConf.singleReplica = undefined;

            replicaServerConf = {};
            replicaServerConf[host] = {};
            replicaServerConf[host][replica] = singleReplicaConf;

            fs.writeFileSync(
              `./engine-private/replica/${replicaDeployId}/conf.server.json`,
              JSON.stringify(replicaServerConf, null, 4),
              'utf8',
            );
          }
        }
      }
      break;
    }
    case 'build-macro-replica':
      getDataDeploy({ buildSingleReplica: true });
      shellExec(`node bin/deploy sync-env-port ${process.argv[3]}`);
      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
