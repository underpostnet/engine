import fs from 'fs-extra';
import axios from 'axios';

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
  getDeployGroupId,
  deployRun,
  updateSrc,
  getDataDeploy,
  buildReplicaId,
  Cmd,
  restoreMacroDb,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { range, setPad, timer, uniqueArray } from '../src/client/components/core/CommonJs.js';
import toJsonSchema from 'to-json-schema';
import simpleGit from 'simple-git';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

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
    case 'conf': {
      loadConf(process.argv[3]);
      if (process.argv[4]) fs.writeFileSync(`.env`, fs.readFileSync(`.env.${process.argv[4]}`, 'utf8'), 'utf8');
      break;
    }
    case 'run':
      {
        if (process.argv.includes('replicas')) {
          const deployGroupId = getDeployGroupId();
          const dataDeploy = getDataDeploy({
            deployId: process.argv[3],
            buildSingleReplica: true,
            deployGroupId,
          });
          if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
          updateSrc();
          await deployRun(dataDeploy);
        } else {
          loadConf(process.argv[3]);
          shellExec(`npm start ${process.argv[3]}`);
        }
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
    case 'build-full-client':
      {
        const { deployId, folder } = loadConf(process.argv[3]);

        let argHost = process.argv[4] ? process.argv[4].split(',') : undefined;
        let argPath = process.argv[5] ? process.argv[5].split(',') : undefined;
        let deployIdSingleReplicas = [];
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
              serverConf[host][path].liteBuild = process.argv.includes('l') ? true : false;
              serverConf[host][path].minifyBuild = process.env.NODE_ENV === 'production' ? true : false;
              if (process.env.NODE_ENV === 'development' && process.argv.includes('static')) {
                serverConf[host][path].apiBaseProxyPath = '/';
                serverConf[host][path].apiBaseHost = `localhost:${parseInt(process.env.PORT) + 1}`;
              }
              if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                deployIdSingleReplicas = deployIdSingleReplicas.concat(
                  serverConf[host][path].replicas.map((replica) => buildReplicaId({ deployId, replica })),
                );

                shellExec(Cmd.replica(deployId, host, path));
              }
            }
          }
        }
        fs.writeFileSync(`./conf/conf.server.json`, JSON.stringify(serverConf, null, 4), 'utf-8');
        await buildClient();

        for (const replicaDeployId of deployIdSingleReplicas) {
          shellExec(Cmd.conf(replicaDeployId));
          shellExec(Cmd.build(replicaDeployId));
        }
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
        const dataDeploy = getDataDeploy({ deployGroupId: process.argv[3], buildSingleReplica: true });
        await deployRun(dataDeploy, true);
      }
      break;

    case 'run-macro-build':
      {
        if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
        updateSrc();
        const dataDeploy = getDataDeploy({ deployGroupId: process.argv[3], buildSingleReplica: true });
        for (const deploy of dataDeploy) {
          shellExec(Cmd.conf(deploy.deployId));
          shellExec(Cmd.build(deploy.deployId));
        }
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

        shellExec(`docker-compose -f engine-private/prometheus/prometheus-service.yml up -d`);
      }
      break;

    case 'sync-env-port':
      const dataDeploy = getDataDeploy({ deployGroupId: process.argv[3], disableSyncEnvPort: true });
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
        const proxyInstance = deployId.match('proxy') || deployId.match('cron');
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
    case 'uml':
      {
        shellExec(`node bin/deploy fix-uml ${process.argv.slice(3).join(' ')}`);
        shellExec(`node bin/deploy build-uml ${process.argv.slice(3).join(' ')}`);
      }
      break;

    case 'fix-uml': {
      // required: java jdk-11.0.1

      // comment:
      // '--add-opens=java.xml/com.sun.org.apache.xalan.internal.xsltc.trax="ALL-UNNAMED"'
      // in plantuml.js src

      // const deployId = process.argv[3];
      // const clientId = process.argv[4];
      // const folder = `./src/client/public/${clientId ? clientId : 'default'}/docs/plantuml`;
      // const privateConfFolder = `./engine-private/conf/${deployId}`;
      // const confData = !deployId
      //   ? Config.default
      //   : {
      //       client: JSON.parse(fs.readFileSync(`${privateConfFolder}/conf.client.json`, 'utf8')),
      //       ssr: JSON.parse(fs.readFileSync(`${privateConfFolder}/conf.ssr.json`, 'utf8')),
      //       server: JSON.parse(fs.readFileSync(`${privateConfFolder}/conf.server.json`, 'utf8')),
      //       cron: JSON.parse(fs.readFileSync(`${privateConfFolder}/conf.cron.json`, 'utf8')),
      //     };

      fs.writeFileSync(
        `./node_modules/plantuml/lib/plantuml.js`,
        fs
          .readFileSync(`./node_modules/plantuml/lib/plantuml.js`, 'utf8')
          .replace(`'--add-opens=java.xml/com.sun.org.apache.xalan.internal.xsltc.trax="ALL-UNNAMED"'`, `//`),
      );
    }
    case 'build-uml':
      {
        const host = process.argv[3];
        const path = process.argv[4];
        const folder = `./public/${host}${path}/docs/plantuml`;
        const confData = Config.default;

        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        for (const typeConf of Object.keys(confData)) {
          {
            const svg = await plantuml(`
              @startjson
                ${JSON.stringify(confData[typeConf])}
              @endjson
            `);
            fs.writeFileSync(`${folder}/${typeConf}-conf.svg`, svg);
          }
          {
            const svg = await plantuml(`
            @startjson
              ${JSON.stringify(toJsonSchema(confData[typeConf]))}
            @endjson
          `);
            fs.writeFileSync(`${folder}/${typeConf}-schema.svg`, svg);
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
      getDataDeploy({ deployGroupId: process.argv[3], buildSingleReplica: true });
      break;
    case 'update-version':
      {
        const newVersion = process.argv[3];
        const originPackageJson = JSON.parse(fs.readFileSync(`package.json`, 'utf8'));
        const { version } = originPackageJson;
        originPackageJson.version = newVersion;
        fs.writeFileSync(`package.json`, JSON.stringify(originPackageJson, null, 4), 'utf8');

        const originPackageLockJson = JSON.parse(fs.readFileSync(`package-lock.json`, 'utf8'));
        originPackageLockJson.version = newVersion;
        originPackageLockJson.packages[''].version = newVersion;
        fs.writeFileSync(`package-lock.json`, JSON.stringify(originPackageLockJson, null, 4), 'utf8');

        if (fs.existsSync(`./engine-private/conf`)) {
          const files = await fs.readdir(`./engine-private/conf`, { recursive: true });
          for (const relativePath of files) {
            const filePah = `./engine-private/conf/${relativePath.replaceAll(`\\`, '/')}`;
            if (filePah.split('/').pop() === 'package.json') {
              const originPackage = JSON.parse(fs.readFileSync(filePah, 'utf8'));
              originPackage.version = newVersion;
              fs.writeFileSync(filePah, JSON.stringify(originPackage, null, 4), 'utf8');
            }
          }
        }

        fs.writeFileSync(
          `./docker-compose.yml`,
          fs
            .readFileSync(`./docker-compose.yml`, 'utf8')
            .replaceAll(`engine.version: '${version}'`, `engine.version: '${newVersion}'`),
          'utf8',
        );

        if (fs.existsSync(`./.github/workflows/docker-image.yml`))
          fs.writeFileSync(
            `./.github/workflows/docker-image.yml`,
            fs
              .readFileSync(`./.github/workflows/docker-image.yml`, 'utf8')
              .replaceAll(`underpost-engine:v${version}`, `underpost-engine:v${newVersion}`),
            'utf8',
          );

        fs.writeFileSync(
          `./src/client/components/core/Docs.js`,
          fs
            .readFileSync(`./src/client/components/core/Docs.js`, 'utf8')
            .replaceAll(`/engine/${version}`, `/engine/${newVersion}`),
          'utf8',
        );

        fs.writeFileSync(
          `./src/client/ssr/body-components/CacheControl.js`,
          fs
            .readFileSync(`./src/client/ssr/body-components/CacheControl.js`, 'utf8')
            .replaceAll(`v${version}`, `v${newVersion}`),
          'utf8',
        );

        fs.writeFileSync(
          `./bin/index.js`,
          fs.readFileSync(`./bin/index.js`, 'utf8').replaceAll(`${version}`, `${newVersion}`),
          'utf8',
        );
      }
      break;

    case 'update-authors': {
      // shellExec(`git log --reverse --format='%aN (<%aE>)' | sort -u`, { stdout: true });
      const logs = await simpleGit().log();

      fs.writeFileSync(
        './AUTHORS.md',
        `# Authors

#### Ordered by first contribution.

${uniqueArray(logs.all.map((log) => `- ${log.author_name} ([${log.author_email}](mailto:${log.author_email}))`)).join(`
`)}

#### Generated by [underpost.net](https://underpost.net)`,
        'utf8',
      );

      // hash: '1c7418ad2f49c7798a6d28d370b34c69d31dce46',
      // date: '2024-09-16T17:10:13-03:00',
      // message: 'update',
      // refs: '',
      // body: '',
      // author_name: 'fcoverdugo',
      // author_email: 'fcoverdugoa@underpost.net'
    }

    case 'restore-macro-db':
      {
        const deployGroupId = process.argv[3];
        await restoreMacroDb(deployGroupId);
      }

      break;
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
