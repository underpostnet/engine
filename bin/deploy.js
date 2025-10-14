import fs from 'fs-extra';
import axios from 'axios';

import dotenv from 'dotenv';

import { pbcopy, shellCd, shellExec } from '../src/server/process.js';
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
  getDataDeploy,
  buildReplicaId,
  Cmd,
  writeEnv,
  buildCliDoc,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { DefaultConf } from '../conf.js';
import colors from 'colors';
import { program } from '../src/cli/index.js';
import { getLocalIPv4Address, ip } from '../src/server/dns.js';
import { timer } from '../src/client/components/core/CommonJs.js';

colors.enable();

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

try {
  switch (operator) {
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
      let subConf = process.argv[5] ?? '';

      if (!['current', 'clean'].includes(process.argv[3]))
        dotenv.config({ path: `./engine-private/conf/${process.argv[3]}/.env.${process.argv[4]}`, override: true });

      loadConf(process.argv[3], subConf);
      break;
    }

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
        dotenv.config({ override: true });
        if (!process.argv[3]) process.argv[3] = 'dd-default';
        const { deployId } = loadConf(process.argv[3], process.argv[4] ?? '');

        let argHost = process.argv[5] ? process.argv[5].split(',') : [];
        let argPath = process.argv[6] ? process.argv[6].split(',') : [];
        let deployIdSingleReplicas = [];
        const serverConf = deployId
          ? JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'))
          : Config.default.server;
        for (const host of Object.keys(serverConf)) {
          for (const path of Object.keys(serverConf[host])) {
            if (argHost.length && argPath.length && (!argHost.includes(host) || !argPath.includes(path))) {
              delete serverConf[host][path];
            } else {
              serverConf[host][path].liteBuild = process.argv.includes('l') ? true : false;
              serverConf[host][path].minifyBuild = process.env.NODE_ENV === 'production' ? true : false;
              if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                deployIdSingleReplicas = deployIdSingleReplicas.concat(
                  serverConf[host][path].replicas.map((replica) => buildReplicaId({ deployId, replica })),
                );
              }
            }
          }
        }
        fs.writeFileSync(`./conf/conf.server.json`, JSON.stringify(serverConf, null, 4), 'utf-8');
        await buildClient();

        for (const replicaDeployId of deployIdSingleReplicas) {
          shellExec(Cmd.conf(replicaDeployId, process.env.NODE_ENV));
          shellExec(Cmd.build(replicaDeployId));
        }
      }
      break;

    case 'update-dependencies':
      const files = await fs.readdir(`./engine-private/conf`, { recursive: true });
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      for (const relativePath of files) {
        const filePah = `./engine-private/conf/${relativePath.replaceAll(`\\`, '/')}`;
        if (filePah.split('/').pop() === 'package.json') {
          const deployPackage = JSON.parse(fs.readFileSync(filePah), 'utf8');
          deployPackage.dependencies = originPackage.dependencies;
          deployPackage.devDependencies = originPackage.devDependencies;
          fs.writeFileSync(filePah, JSON.stringify(deployPackage, null, 4), 'utf8');
        }
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
        const baseConfPath = fs.existsSync(`./engine-private/replica/${deployId}`)
          ? `./engine-private/replica`
          : `./engine-private/conf`;
        for (const envInstanceObj of dataEnv) {
          const envPath = `${baseConfPath}/${deployId}/.env.${envInstanceObj.env}`;
          const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
          envObj.PORT = envInstanceObj.port + port - singleReplicaHosts.length - (replicaHost ? 1 : 0);

          writeEnv(envPath, envObj);
        }
        const serverConf = loadReplicas(
          JSON.parse(fs.readFileSync(`${baseConfPath}/${deployId}/conf.server.json`, 'utf8')),
        );
        for (const host of Object.keys(serverConf)) port += Object.keys(serverConf[host]).length;
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
                .replaceAll(`${deployId}`, `${replicaDeployId}`),
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

    case 'rename-package': {
      const name = process.argv[3];
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      originPackage.name = name;
      fs.writeFileSync(`./package.json`, JSON.stringify(originPackage, null, 4), 'utf8');

      const originPackageLockJson = JSON.parse(fs.readFileSync(`./package-lock.json`, 'utf8'));
      originPackageLockJson.name = name;
      originPackageLockJson.packages[''].name = name;
      fs.writeFileSync(`./package-lock.json`, JSON.stringify(originPackageLockJson, null, 4), 'utf8');

      break;
    }

    case 'set-repo': {
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      originPackage.repository = {
        type: 'git',
        url: `git+https://github.com/${process.argv[3]}.git`,
      };
      fs.writeFileSync(`./package.json`, JSON.stringify(originPackage, null, 4), 'utf8');

      break;
    }

    case 'clean-core-repo': {
      shellCd(`/home/dd/engine`);
      shellExec(`git reset`);
      shellExec(`git checkout .`);
      shellExec(`git clean -f -d`);
      shellCd(`/home/dd/engine/engine-private`);
      shellExec(`git reset`);
      shellExec(`git checkout .`);
      shellExec(`git clean -f -d`);
      shellCd(`/home/dd/engine`);
      break;
    }

    case 'version-build': {
      shellCd(`/home/dd/engine`);
      shellExec(`node bin/deploy clean-core-repo`);
      shellExec(`node bin pull . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`node bin run kill 4001`);
      shellExec(`node bin run kill 4002`);
      shellExec(`node bin run kill 4003`);
      shellExec(`npm run update-template`);
      shellExec(`cd ../pwa-microservices-template && npm install`);
      shellExec(`cd ../pwa-microservices-template && npm run build && timeout 5s npm run dev`, {
        async: true,
      });
      await timer(5500);
      const templateRunnerResult = fs.readFileSync(`../pwa-microservices-template/logs/start.js/all.log`, 'utf8');
      logger.info('Test template runner result');
      console.log(templateRunnerResult);
      if (!templateRunnerResult || templateRunnerResult.toLowerCase().match('error')) {
        logger.error('Test template runner result failed');
        break;
      }
      shellCd(`/home/dd/engine`);
      shellExec(`node bin/deploy clean-core-repo`);
      const originPackageJson = JSON.parse(fs.readFileSync(`package.json`, 'utf8'));
      const newVersion = process.argv[3] ?? originPackageJson.version;
      const node = process.argv[4] ?? 'kind-control-plane';
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
          if (filePah.split('/').pop() === 'deployment.yaml') {
            fs.writeFileSync(
              filePah,
              fs
                .readFileSync(filePah, 'utf8')
                .replaceAll(`v${version}`, `v${newVersion}`)
                .replaceAll(`engine.version: ${version}`, `engine.version: ${newVersion}`),
              'utf8',
            );
          }
        }
      }

      fs.writeFileSync(
        `./manifests/deployment/dd-default-development/deployment.yaml`,
        fs
          .readFileSync(`./manifests/deployment/dd-default-development/deployment.yaml`, 'utf8')
          .replaceAll(`underpost:v${version}`, `underpost:v${newVersion}`),
        'utf8',
      );

      if (fs.existsSync(`./.github/workflows/docker-image.ci.yml`))
        fs.writeFileSync(
          `./.github/workflows/docker-image.ci.yml`,
          fs
            .readFileSync(`./.github/workflows/docker-image.ci.yml`, 'utf8')
            .replaceAll(`underpost-engine:v${version}`, `underpost-engine:v${newVersion}`),
          'utf8',
        );

      fs.writeFileSync(
        `./src/index.js`,
        fs.readFileSync(`./src/index.js`, 'utf8').replaceAll(`${version}`, `${newVersion}`),
        'utf8',
      );
      shellExec(`node bin/deploy cli-docs ${version} ${newVersion}`);
      shellExec(`node bin/deploy update-dependencies`);
      shellExec(`auto-changelog`);
      shellExec(`node bin/build dd`);
      shellExec(
        `node bin deploy --kubeadm --build-manifest --sync --info-router --replicas 1 --node ${node} dd production`,
      );
      shellExec(
        `node bin deploy --kubeadm --build-manifest --sync --info-router --replicas 1 --node ${node} dd development `,
      );
      for (const deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(`,`)) {
        fs.copySync(
          `./engine-private/conf/${deployId}/build/development/deployment.yaml`,
          `./manifests/deployment/${deployId}-development/deployment.yaml`,
        );
        fs.copySync(
          `./engine-private/conf/${deployId}/build/development/proxy.yaml`,
          `./manifests/deployment/${deployId}-development/proxy.yaml`,
        );
      }
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin new --deploy-id dd-default`);
      console.log(fs.existsSync(`./engine-private/conf/dd-default`));
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin/deploy build-env`);
      break;
    }

    case 'version-deploy': {
      shellExec(
        `underpost secret underpost --create-from-file /home/dd/engine/engine-private/conf/dd-cron/.env.production`,
      );
      shellExec(`node bin/build dd conf`);
      shellExec(`git add . && cd ./engine-private && git add .`);
      shellExec(`node bin cmt . ci package-pwa-microservices-template`);
      shellExec(`node bin cmt ./engine-private ci package-pwa-microservices-template`);
      shellExec(`node bin push . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`cd ./engine-private && node ../bin push . ${process.env.GITHUB_USERNAME}/engine-private`);
      break;
    }

    case 'update-authors': {
      // #### Ordered by first contribution.
      fs.writeFileSync(
        './AUTHORS.md',
        `# Authors


${shellExec(`git log | grep Author: | sort -u`, { stdout: true }).split(`\n`).join(`\n\n\n`)}

#### Generated by [underpost.net](https://underpost.net)`,
        'utf8',
      );

      break;
    }

    case 'heb': {
      // https://besu.hyperledger.org/
      // https://github.com/hyperledger/besu/archive/refs/tags/24.9.1.tar.gz

      switch (process.platform) {
        case 'linux':
          {
            shellCd(`..`);

            // Download the Linux binary
            shellExec(`wget https://github.com/hyperledger/besu/releases/download/24.9.1/besu-24.9.1.tar.gz`);

            // Unzip the file:
            shellExec(`tar -xvzf besu-24.9.1.tar.gz`);

            shellCd(`besu-24.9.1`);

            shellExec(`bin/besu --help`);

            // Set env path
            // export PATH=$PATH:/home/dd/besu-24.9.1/bin

            // Open src
            // shellExec(`sudo code /home/dd/besu-24.9.1 --user-data-dir="/root/.vscode-root" --no-sandbox`);
          }

          break;

        default:
          break;
      }

      break;
    }
    case 'build-env': {
      const buildEnv = (privateEnvPath, originEnv, env) => {
        const privateEnv = dotenv.parse(fs.readFileSync(privateEnvPath, 'utf8'));
        for (const key of Object.keys(privateEnv)) {
          if (key in env) {
            console.warn(`Key ${key} already exists in origin env`);
            continue;
          }
          if (key in originEnv) {
            console.warn(`Key ${key} already exists in origin env`);
            env[key] = originEnv[key];
            continue;
          }
          env[key] =
            `${key}`.toUpperCase().match('API') ||
            `${key}`.toUpperCase().match('KEY') ||
            `${key}`.toUpperCase().match('SECRET') ||
            `${key}`.toUpperCase().match('TOKEN') ||
            `${key}`.toUpperCase().match('PASSWORD') ||
            `${key}`.toUpperCase().match('MAC')
              ? 'changethis'
              : isNaN(parseFloat(privateEnv[key]))
              ? `${privateEnv[key]}`.match(`@`)
                ? 'admin@default.net'
                : 'changethis'
              : privateEnv[key];
        }
        return env;
      };
      for (let envPath of ['.env.development', '.env.production', '.env.test']) {
        const originEnv = dotenv.parse(fs.readFileSync(`./${envPath}`, 'utf8'));

        let env = {};
        env = buildEnv(`./engine-private/conf/dd-cron/${envPath}`, originEnv, env);
        env = buildEnv(`./engine-private/conf/dd-core/${envPath}`, originEnv, env);
        writeEnv(envPath, env);
      }
      break;
    }

    case 'update-default-conf': {
      const defaultServer = DefaultConf.server['default.net']['/'];
      let confName = process.argv[3];
      let defaultConf = false;
      if (confName === 'dd-github-pages') {
        const host = `${process.env.GITHUB_USERNAME ?? 'underpostnet'}.github.io`;
        const path = '/pwa-microservices-template-ghpkg';
        DefaultConf.server = {
          [host]: { [path]: defaultServer },
        };
        DefaultConf.server[host][path].apiBaseProxyPath = '/';
        DefaultConf.server[host][path].apiBaseHost = 'www.nexodev.org';
        defaultConf = true;
      } else if (confName === 'template') {
        const host = 'default.net';
        const path = '/';
        DefaultConf.server[host][path].valkey = {
          port: 6379,
          host: 'valkey-service.default.svc.cluster.local',
        };
        // mongodb-0.mongodb-service
        DefaultConf.server[host][path].db.host = 'mongodb://mongodb-service:27017';
        defaultConf = true;
      } else if (confName && fs.existsSync(`./engine-private/conf/${confName}`)) {
        DefaultConf.client = JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.client.json`, 'utf8'));
        DefaultConf.server = JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.server.json`, 'utf8'));
        DefaultConf.ssr = JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.ssr.json`, 'utf8'));
        // DefaultConf.cron = JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.cron.json`, 'utf8'));

        for (const host of Object.keys(DefaultConf.server)) {
          for (const path of Object.keys(DefaultConf.server[host])) {
            DefaultConf.server[host][path].db = defaultServer.db;
            DefaultConf.server[host][path].mailer = defaultServer.mailer;

            delete DefaultConf.server[host][path]._wp_client;
            delete DefaultConf.server[host][path]._wp_git;
            delete DefaultConf.server[host][path]._wp_directory;
            delete DefaultConf.server[host][path].wp;
            delete DefaultConf.server[host][path].git;
            delete DefaultConf.server[host][path].directory;
          }
        }
      }
      const sepRender = '/**/';
      const confRawPaths = fs.readFileSync('./conf.js', 'utf8').split(sepRender);
      confRawPaths[1] = `${JSON.stringify(DefaultConf)};`;
      const targetConfPath = `./conf${defaultConf ? '' : `.${confName}`}.js`;
      fs.writeFileSync(targetConfPath, confRawPaths.join(sepRender), 'utf8');
      shellExec(`prettier --write ${targetConfPath}`);

      switch (confName) {
        case 'dd-github-pages':
          {
            if (fs.exists(`./engine-private/conf/${confName}`)) fs.removeSync(`./engine-private/conf/${confName}`);
            shellExec(`node bin new --deploy-id ${confName}`);
          }
          break;

        default:
          break;
      }

      break;
    }

    case 'ssh': {
      // only import + start
      // node bin/deploy ssh root@<host> <password> import

      // generate + import + start
      // node bin/deploy ssh root@<host> <password>

      const host = process.argv[3] ?? `root@${await ip.public.ipv4()}`;
      const domain = host.split('@')[1];
      const user = 'root'; // host.split('@')[0];
      const password = process.argv[4] ?? '';
      const port = 22;

      const setUpSSH = () => {
        // Required port forwarding mapping
        // ssh	TCP	2222	22	<local-server-ip>
        // ssh	UDP	2222	22	<local-server-ip>

        // Remote connect via public key
        // ssh -i <key-path> <user>@<host>:2222

        shellExec(`cat ./engine-private/deploy/id_rsa.pub > ~/.ssh/authorized_keys`);

        // local trust on first use validator
        // check ~/.ssh/known_hosts

        // shellExec(`sudo sed -i -e "s@#PasswordAuthentication yes@PasswordAuthentication no@g" /etc/ssh/sshd_config`);
        // shellExec(`sudo sed -i -e "s@#UsePAM no@UsePAM yes@g" /etc/ssh/sshd_config`);

        // Include /etc/ssh/sshd_config.d/*.conf
        // sudo tee /etc/ssh/sshd_config.d/99-custom.conf
        shellExec(`sudo tee /etc/ssh/sshd_config <<EOF
PasswordAuthentication	no
ChallengeResponseAuthentication	yes
UsePAM	yes
PubkeyAuthentication	Yes
RSAAuthentication	Yes
PermitRootLogin	Yes
X11Forwarding	yes
X11DisplayOffset	10
LoginGraceTime	120
StrictModes	yes
SyslogFacility	AUTH
LogLevel	INFO
#HostKey	/etc/ssh/ssh_host_ecdsa_key
HostKey	/etc/ssh/ssh_host_ed25519_key
#HostKey	/etc/ssh/ssh_host_rsa_key
AuthorizedKeysFile	~/.ssh/authorized_keys
Subsystem	sftp	/usr/libexec/openssh/sftp-server
ListenAddress 0.0.0.0
ListenAddress ::
ListenAddress ${domain}
ListenAddress ${domain}:22
EOF`);

        shellExec(`sudo chmod 700 ~/.ssh/`);
        shellExec(`sudo chmod 600 ~/.ssh/authorized_keys`);
        shellExec(`sudo chmod 644 ~/.ssh/known_hosts`);
        shellExec(`sudo chmod 600 ~/.ssh/id_rsa`);
        shellExec(`sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`);
        shellExec(`chown -R ${user}:${user} ~/.ssh`);

        shellExec(`ufw allow ${port}/tcp`);
        shellExec(`ufw allow ${port}/udp`);
        shellExec(`ufw allow ssh`);
        shellExec(`ufw allow from 192.168.0.0/16 to any port 22`);

        // active ssh-agent
        shellExec('eval `ssh-agent -s`' + ` && ssh-add ~/.ssh/id_rsa` + ` && ssh-add -l`);
        // remove all
        // shellExec(`ssh-add -D`);
        // remove single
        // shellExec(`ssh-add -d ~/.ssh/id_rsa`);

        // shellExec(`echo "@${host.split(`@`)[1]} * $(cat ~/.ssh/id_rsa.pub)" > ~/.ssh/known_hosts`);
        shellExec('eval `ssh-agent -s`' + `&& ssh-keyscan -H -t ed25519 ${host.split(`@`)[1]} > ~/.ssh/known_hosts`);
        // shellExec(`sudo echo "" > ~/.ssh/known_hosts`);

        // ssh-copy-id -i ~/.ssh/id_rsa.pub -p <port_number> <username>@<host>
        // shellExec(`ssh-copy-id -i ~/.ssh/id_rsa.pub -p ${port} ${host}`);
        // debug:
        // shellExec(`ssh -vvv ${host}`);

        shellExec(`sudo cp ./engine-private/deploy/id_rsa ~/.ssh/id_rsa`);
        shellExec(`sudo cp ./engine-private/deploy/id_rsa.pub ~/.ssh/id_rsa.pub`);

        shellExec(`sudo echo "" > /etc/ssh/ssh_host_ecdsa_key`);
        shellExec(`sudo cp ./engine-private/deploy/id_rsa /etc/ssh/ssh_host_ed25519_key`);
        shellExec(`sudo echo "" > /etc/ssh/ssh_host_rsa_key`);

        shellExec(`sudo echo "" > /etc/ssh/ssh_host_ecdsa_key.pub`);
        shellExec(`sudo cp ./engine-private/deploy/id_rsa.pub /etc/ssh/ssh_host_ed25519_key.pub`);
        shellExec(`sudo echo "" > /etc/ssh/ssh_host_rsa_key.pub`);

        shellExec(`sudo systemctl enable sshd`);
        shellExec(`sudo systemctl restart sshd`);

        const status = shellExec(`sudo systemctl status sshd`, { silent: true, stdout: true });
        console.log(
          status.match('running') ? status.replaceAll(`running`, `running`.green) : `ssh service not running`.red,
        );
      };

      if (process.argv.includes('import')) {
        setUpSSH();
        break;
      }

      shellExec(`sudo rm -rf ./id_rsa`);
      shellExec(`sudo rm -rf ./id_rsa.pub`);

      if (process.argv.includes('legacy'))
        shellExec(`ssh-keygen -t rsa -b 4096 -f id_rsa -N "${password}" -q -C "${host}"`);
      else shellExec(`ssh-keygen -t ed25519 -f id_rsa -N "${password}" -q -C "${host}"`);

      shellExec(`sudo cp ./id_rsa ~/.ssh/id_rsa`);
      shellExec(`sudo cp ./id_rsa.pub ~/.ssh/id_rsa.pub`);

      shellExec(`sudo cp ./id_rsa ./engine-private/deploy/id_rsa`);
      shellExec(`sudo cp ./id_rsa.pub ./engine-private/deploy/id_rsa.pub`);

      shellExec(`sudo rm -rf ./id_rsa`);
      shellExec(`sudo rm -rf ./id_rsa.pub`);
      setUpSSH();
      break;
    }

    case 'maas-db': {
      // DROP, ALTER, CREATE, WITH ENCRYPTED
      // sudo -u <user> -h <host> psql <db-name>
      shellExec(`DB_PG_MAAS_NAME=${process.env.DB_PG_MAAS_NAME}`);
      shellExec(`DB_PG_MAAS_PASS=${process.env.DB_PG_MAAS_PASS}`);
      shellExec(`DB_PG_MAAS_USER=${process.env.DB_PG_MAAS_USER}`);
      shellExec(`DB_PG_MAAS_HOST=${process.env.DB_PG_MAAS_HOST}`);
      shellExec(
        `sudo -i -u postgres psql -c "CREATE USER \"$DB_PG_MAAS_USER\" WITH ENCRYPTED PASSWORD '$DB_PG_MAAS_PASS'"`,
      );
      shellExec(
        `sudo -i -u postgres psql -c "ALTER USER \"$DB_PG_MAAS_USER\" WITH ENCRYPTED PASSWORD '$DB_PG_MAAS_PASS'"`,
      );
      const actions = ['LOGIN', 'SUPERUSER', 'INHERIT', 'CREATEDB', 'CREATEROLE', 'REPLICATION'];
      shellExec(`sudo -i -u postgres psql -c "ALTER USER \"$DB_PG_MAAS_USER\" WITH ${actions.join(' ')}"`);
      shellExec(`sudo -i -u postgres psql -c "\\du"`);

      shellExec(`sudo -i -u postgres createdb -O "$DB_PG_MAAS_USER" "$DB_PG_MAAS_NAME"`);

      shellExec(`sudo -i -u postgres psql -c "\\l"`);
      break;
    }

    case 'cli-docs': {
      buildCliDoc(program, process.argv[3], process.argv[4]);
      break;
    }

    case 'postgresql': {
      if (process.argv.includes('install')) {
        shellExec(`sudo dnf install -y postgresql-server postgresql`);
        shellExec(`sudo postgresql-setup --initdb`);
        shellExec(`chown postgres /var/lib/pgsql/data`);
        shellExec(`sudo systemctl enable postgresql.service`);
        shellExec(`sudo systemctl start postgresql.service`);
      } else {
        shellExec(`sudo systemctl enable postgresql.service`);
        shellExec(`sudo systemctl restart postgresql.service`);
      }

      shellExec(`sudo systemctl status postgresql.service`);

      // sudo systemctl stop postgresql
      // sudo systemctl disable postgresql

      // psql login
      // psql -U <user> -h 127.0.0.1 -W <db-name>

      // gedit /var/lib/pgsql/data/pg_hba.conf
      // host    <db-name>    	<db-user>        <db-host>               md5
      // local   all             postgres                                trust
      // # "local" is for Unix domain socket connections only
      // local   all             all                                     md5
      // # IPv4 local connections:
      // host    all             all             127.0.0.1/32            md5
      // # IPv6 local connections:
      // host    all             all             ::1/128                 md5

      // gedit /var/lib/pgsql/data/postgresql.conf
      // listen_addresses = '*'

      break;
    }

    case 'postgresql-17': {
      if (process.argv.includes('install')) {
        shellExec(`sudo dnf module reset postgresql -y`);
        shellExec(`sudo dnf -qy module disable postgresql`);
        shellExec(
          `sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm`,
        );
        shellExec(`sudo dnf -qy module disable postgresql`);
        shellExec(`sudo dnf install -y postgresql17 postgresql17-server postgresql17-contrib`);

        shellExec(`sudo /usr/pgsql-17/bin/postgresql-17-setup initdb`);
      }
      if (process.argv.includes('uninstall')) {
        shellExec(`sudo systemctl stop postgresql-17`);
        shellExec(`sudo systemctl disable postgresql-17`);

        // Remove PostgreSQL 17 packages and repo
        shellExec(`sudo dnf remove -y postgresql17 postgresql17-server postgresql17-contrib`);
        shellExec(`sudo rpm -e pgdg-redhat-repo-$(rpm -q pgdg-redhat-repo --qf '%{VERSION}-%{RELEASE}') || true`);
        shellExec(`sudo rm -f /etc/yum.repos.d/pgdg-redhat-*.repo`);

        // Clean up data, logs, config, and the postgres user
        shellExec(`sudo rm -rf /var/lib/pgsql/17 /var/log/pgsql`);
        shellExec(`sudo rm -rf /etc/postgresql`);
      } else {
        shellExec(`sudo systemctl enable postgresql-17`);
        shellExec(`sudo systemctl start postgresql-17`);
      }
      break;
    }

    case 'postgresql-14': {
      if (process.argv.includes('install')) {
        shellExec(`sudo dnf module reset postgresql -y`);
        shellExec(`sudo dnf -qy module disable postgresql`);

        shellExec(`sudo systemctl stop postgresql-14`);
        shellExec(`sudo systemctl disable postgresql-14`);

        shellExec(`sudo dnf remove -y postgresql14 postgresql14-server postgresql14-contrib`);
        shellExec(`sudo rm -rf /var/lib/pgsql`);

        shellExec(`sudo dnf install postgresql14 postgresql14-server postgresql14-contrib -y`);
      }
      if (process.argv.includes('uninstall')) {
        shellExec(`sudo systemctl stop postgresql-14`);
        shellExec(`sudo systemctl disable postgresql-14`);
        shellExec(`sudo dnf remove -y postgresql14 postgresql14-server postgresql14-contrib`);
        shellExec(`sudo rm -rf /var/lib/pgsql /var/log/pgsql /etc/postgresql`);
      } else {
        shellExec(`sudo /usr/pgsql-14/bin/postgresql-14-setup initdb`);
        shellExec(`sudo systemctl start postgresql-14`);
        shellExec(`sudo systemctl enable postgresql-14`);
        shellExec(`sudo systemctl status postgresql-14`);
        // sudo dnf install postgresql14-contrib
      }

      break;
    }

    case 'pg-stop': {
      shellExec(`sudo systemctl stop postgresql-14`);
      shellExec(`sudo systemctl disable postgresql-14`);
      break;
    }
    case 'pg-start': {
      shellExec(`sudo systemctl enable postgresql-14`);
      shellExec(`sudo systemctl restart postgresql-14`);
      break;
    }

    case 'pg-list-db': {
      shellExec(`sudo -i -u postgres psql -c "\\l"`);
      break;
    }

    case 'pg-list-table': {
      shellExec(`sudo -i -u postgres psql -c "\\dt *.*"`);
      // schema_name.*
      break;
    }
    case 'pg-drop-db': {
      shellExec(`sudo -i -u postgres psql -c "DROP DATABASE ${process.argv[3]} WITH (FORCE)"`);
      shellExec(`sudo -i -u postgres psql -c "DROP USER ${process.argv[4]}"`);
      break;
    }

    case 'maas-stop': {
      shellExec(`sudo snap stop maas`);
      break;
    }

    case 'nfs': {
      // Daemon RPC  NFSv3. ports:

      // 2049 (TCP/UDP) – nfsd standard port.
      // 111 (TCP/UDP) – rpcbind/portmapper.
      // 20048 (TCP/UDP) – rpc.mountd.
      // 32765 (TCP/UDP) – rpc.statd.
      // 32766 (TCP/UDP) – lockd (NLM).

      // Configure export and permissions:
      // /etc/exports

      // Configure ports:
      // /etc/nfs.conf

      fs.writeFileSync(
        `/etc/nfs.conf`,
        `
[mountd]
port = 20048

[statd]
port = 32765
outgoing-port = 32765

[nfsd]
rdma=y
rdma-port=20049

[lockd]
port = 32766
udp-port = 32766
        `,
        'utf8',
      );

      // Client users have read-only access to resources and are identified as anonymous on the server.
      // /share ip-client(ro,all_squash)

      // Client users can modify resources and keep their UID on the server. Only root is identified as anonymous.
      // /share ip-client(rw)

      // Users on client workstation 1 can modify resources, while those on client workstation 2 have read-only access.
      // UIDs are kept on the server, and only root is identified as anonymous.
      // /share ip-client1(rw) ip-client2(ro)

      // Client1 users can modify resources. Their UID is changed to 1001 and their GID to 100 on the server.
      // /share ip-client(rw,all_squash,anonuid=1001,anongid=100)

      // sudo dnf install nfs-utils
      // sudo systemctl enable --now rpcbind    // RPC map service
      // sudo systemctl enable --now nfs-server // nfs domains nfsd

      // Update exports:
      // shellExec(`sudo exportfs -a -r`);
      // shellExec(`sudo exportfs -v`);

      // Active nfs
      shellExec(`sudo exportfs -s`);

      shellExec(`sudo exportfs -rav`);

      // Rocky enable virt_use_nfs
      // sudo setsebool -P virt_use_nfs 1

      // Disable share:
      // sudo exportfs -u <client-ip>:${process.env.NFS_EXPORT_PATH}/rpi4mb

      // Nfs client:
      // mount -t nfs <server-ip>:/server-mnt /mnt
      // umount /mnt

      shellExec(`sudo systemctl restart nfs-server`);
      break;
    }

    case 'mount': {
      const mounts = shellExec(`mount`).split(`\n`);
      console.table(
        mounts
          .filter((l) => l.trim())
          .map(
            (o) => (
              (o = o.split(' ')),
              {
                path: o[2],
                type: o[4],
                permissions: o[5],
              }
            ),
          ),
      );
      break;
    }

    case 'create-ports': {
      const cmd = [];
      const commissioningDeviceIp = getLocalIPv4Address();
      for (const port of ['5240']) {
        const name = 'maas';
        cmd.push(`${name}:${port}-${port}:${commissioningDeviceIp}`);
      }
      pbcopy(`node engine-private/r create-port ${cmd}`);
      break;
    }

    case 'maas-ports': {
      // Configure firewall:

      // systemctl stop firewalld
      // systemctl mask firewalld

      // ufw disable
      // ufw enable

      // sudo snap install ufw
      // const ports = ['80', '443', '22', '3000-3100'];
      const ports = [
        '43',
        '53',
        '60',
        '66',
        '67',
        '69',
        '4011',
        '111',
        '2049',
        '20048',
        '20049',
        '32765',
        '32766',
        '5248',
        '5240',
      ];
      for (const port of ports) {
        shellExec(`ufw allow ${port}/tcp`);
        shellExec(`ufw allow ${port}/udp`);
      }

      shellExec(`sudo systemctl mask firewalld`);

      break;
    }

    case 'iptables': {
      shellExec(`sudo systemctl enable nftables`);
      shellExec(`sudo systemctl restart nftables`);

      shellExec(`sudo tee /etc/nftables.conf <<EOF
table inet filter {
  chain input {
    type filter hook input priority 0;
    policy drop;
    tcp dport 22 accept
  }
}
EOF`);
      shellExec(`sudo nft -f /etc/nftables.conf`);

      // sudo systemctl stop nftables
      // sudo systemctl disable nftables

      break;
    }

    case 'rpi4': {
      // Rpi4 Run Bootloader:

      // 1) create boot.conf

      // 2) Run lite RPiOs from rpi-imager
      // with boot.conf files in root disk path

      // 3) cd /boot/firmware && sudo rpi-eeprom-config --apply boot.conf

      // 4) sudo reboot

      // 5) check: 'vcgencmd bootloader_version'
      // 6) check: 'vcgencmd bootloader_config'

      // 7) shutdown and restart without sd card

      // sudo apt update
      // sudo apt install git

      break;
    }

    case 'blue': {
      // lsusb | grep blue -i
      // rfkill list
      // sudo service bluetooth start
      // bluetoothctl show
      // sudo rfkill unblock bluetooth
      // dmesg | grep -i bluetooth
      // journalctl -u bluetooth -f
      // sudo dnf update bluez bluez-libs bluez-utils
      // sudo rmmod btusb
      // sudo modprobe btusb
      break;
    }

    case 'fastapi-models': {
      shellExec(`chmod +x ../full-stack-fastapi-template/backend/initial_data.sh`);
      shellExec(`../full-stack-fastapi-template/backend/initial_data.sh`);
      shellExec(`../full-stack-fastapi-template/backend/initial_data.sh`);
      break;
    }

    case 'fastapi': {
      // node bin/deploy fastapi reset
      // node bin/deploy fastapi reset build-back build-front secret run-back run-front
      // https://github.com/NonsoEchendu/full-stack-fastapi-project
      // https://github.com/fastapi/full-stack-fastapi-template
      const path = `../full-stack-fastapi-template`;
      const VITE_API_URL = `http://localhost:8000`;

      if (process.argv.includes('reset')) shellExec(`sudo rm -rf ${path}`);

      if (!fs.existsSync(path))
        shellExec(`cd .. && git clone https://github.com/fastapi/full-stack-fastapi-template.git`);

      shellExec(`cd ${path} && git checkout . && git clean -f -d`);
      const password = fs.readFileSync(`/home/dd/engine/engine-private/postgresql-password`, 'utf8');

      fs.writeFileSync(
        `${path}/.env`,
        fs
          .readFileSync(`${path}/.env`, 'utf8')
          .replace(`FIRST_SUPERUSER=admin@example.com`, `FIRST_SUPERUSER=development@underpost.net`)
          .replace(`FIRST_SUPERUSER_PASSWORD=changethis`, `FIRST_SUPERUSER_PASSWORD=${password}`)
          .replace(`SECRET_KEY=changethis`, `SECRET_KEY=${password}`)
          .replace(`POSTGRES_DB=app`, `POSTGRES_DB=postgresdb`)
          .replace(`POSTGRES_USER=postgres`, `POSTGRES_USER=admin`)
          .replace(`POSTGRES_PASSWORD=changethis`, `POSTGRES_PASSWORD=${password}`),
        'utf8',
      );
      fs.writeFileSync(
        `${path}/backend/app/core/db.py`,
        fs
          .readFileSync(`${path}/backend/app/core/db.py`, 'utf8')
          .replace(`    # from sqlmodel import SQLModel`, `    from sqlmodel import SQLModel`)
          .replace(`   # SQLModel.metadata.create_all(engine)`, `   SQLModel.metadata.create_all(engine)`),

        'utf8',
      );

      fs.copySync(`./manifests/deployment/fastapi/initial_data.sh`, `${path}/backend/initial_data.sh`);

      fs.writeFileSync(
        `${path}/frontend/Dockerfile`,
        fs
          .readFileSync(`${path}/frontend/Dockerfile`, 'utf8')
          .replace('ARG VITE_API_URL=${VITE_API_URL}', `ARG VITE_API_URL='${VITE_API_URL}'`),
        'utf8',
      );

      fs.writeFileSync(
        `${path}/frontend/.env`,
        fs
          .readFileSync(`${path}/frontend/.env`, 'utf8')
          .replace(`VITE_API_URL=http://localhost:8000`, `VITE_API_URL=${VITE_API_URL}`)
          .replace(`MAILCATCHER_HOST=http://localhost:1080`, `MAILCATCHER_HOST=http://localhost:1081`),

        'utf8',
      );

      if (process.argv.includes('models')) {
        shellExec(`node bin/deploy fastapi-models`);
        break;
      }

      if (process.argv.includes('build-back')) {
        const imageName = `fastapi-backend:latest`;
        shellExec(`sudo podman pull docker.io/library/python:3.10`);
        shellExec(`sudo podman pull ghcr.io/astral-sh/uv:0.5.11`);
        shellExec(`sudo rm -rf ${path}/${imageName.replace(':', '_')}.tar`);
        const args = [
          `node bin dockerfile-image-build --path ${path}/backend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'}-load --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('build-front')) {
        const imageName = `fastapi-frontend:latest`;
        shellExec(`sudo podman pull docker.io/library/node:20`);
        shellExec(`sudo podman pull docker.io/library/nginx:1`);
        shellExec(`sudo rm -rf ${path}/${imageName.replace(':', '_')}.tar`);
        const args = [
          `node bin dockerfile-image-build --path ${path}/frontend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'}-load --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('secret')) {
        {
          const secretSelector = `fastapi-postgres-credentials`;
          shellExec(`sudo kubectl delete secret ${secretSelector}`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-literal=POSTGRES_DB=postgresdb` +
              ` --from-literal=POSTGRES_USER=admin` +
              ` --from-file=POSTGRES_PASSWORD=/home/dd/engine/engine-private/postgresql-password`,
          );
        }
        {
          const secretSelector = `fastapi-backend-config-secret`;
          shellExec(`sudo kubectl delete secret ${secretSelector}`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-file=SECRET_KEY=/home/dd/engine/engine-private/postgresql-password` +
              ` --from-literal=FIRST_SUPERUSER=development@underpost.net` +
              ` --from-file=FIRST_SUPERUSER_PASSWORD=/home/dd/engine/engine-private/postgresql-password`,
          );
        }
      }
      if (process.argv.includes('run-back')) {
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-deployment.yml`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-service.yml`);
      }
      if (process.argv.includes('run-front')) {
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-deployment.yml`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-service.yml`);
      }
      break;
    }

    case 'conda': {
      // set -e
      // ENV_NAME="${1:-cuda_env}"
      // eval "$(conda shell.bash hook)"
      // conda activate "${ENV_NAME}"
      shellExec(
        `export PATH="/root/miniconda3/bin:$PATH" && conda init && conda config --set auto_activate_base false`,
      );
      shellExec(`conda env list`);
      break;
    }

    case 'kafka': {
      // https://medium.com/@martin.hodges/deploying-kafka-on-a-kind-kubernetes-cluster-for-development-and-testing-purposes-ed7adefe03cb
      const imageName = `doughgle/kafka-kraft`;
      shellExec(`docker pull ${imageName}`);
      if (!process.argv.includes('kubeadm'))
        shellExec(
          `${process.argv.includes('kubeadm') ? `ctr -n k8s.io images import` : `kind load docker-image`} ${imageName}`,
        );
      shellExec(`kubectl create namespace kafka`);
      shellExec(`kubectl apply -f ./manifests/deployment/kafka/deployment.yaml`);
      // kubectl logs kafka-0 -n kafka | grep STARTED
      // kubectl logs kafka-1 -n kafka | grep STARTED
      // kubectl logs kafka-2 -n kafka | grep STARTED

      // kafka-topics.sh --create --topic my-topic --bootstrap-server kafka-svc:9092
      // kafka-topics.sh --list --topic my-topic --bootstrap-server kafka-svc:9092
      // kafka-topics.sh --delete --topic my-topic --bootstrap-server kafka-svc:9092

      // kafka-console-producer.sh --bootstrap-server kafka-svc:9092 --topic my-topic
      // kafka-console-consumer.sh --bootstrap-server kafka-svc:9092 --topic my-topic
      break;
    }

    case 'nvidia-gpu-operator': {
      // https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
      shellExec(`curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo`);

      const NVIDIA_CONTAINER_TOOLKIT_VERSION = '1.17.8-1';

      shellExec(`sudo dnf install -y \
nvidia-container-toolkit-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
nvidia-container-toolkit-base-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
libnvidia-container-tools-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
libnvidia-container1-${NVIDIA_CONTAINER_TOOLKIT_VERSION}`);

      // https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html

      shellExec(`kubectl create ns gpu-operator`);
      shellExec(`kubectl label --overwrite ns gpu-operator pod-security.kubernetes.io/enforce=privileged`);

      shellExec(`helm repo add nvidia https://helm.ngc.nvidia.com/nvidia \
    && helm repo update`);

      //       shellExec(`helm install --wait --generate-name \
      // -n gpu-operator --create-namespace \
      // nvidia/gpu-operator \
      // --version=v25.3.1 \
      // --set toolkit.version=v1.16.1-ubi8`);

      shellExec(`helm install --wait --generate-name \
-n gpu-operator --create-namespace \
nvidia/gpu-operator \
--version=v25.3.1 \
--set driver.enabled=false \
--set driver.repository=nvcr.io/nvidia \
--set cdi.enabled=true \
--set cdi.default=true \
--set toolkit.env[0].name=CONTAINERD_CONFIG \
--set toolkit.env[0].value=/etc/containerd/config.toml \
--set toolkit.env[1].name=CONTAINERD_SOCKET \
--set toolkit.env[1].value=/run/containerd/containerd.sock \
--set toolkit.env[2].name=CONTAINERD_RUNTIME_CLASS \
--set toolkit.env[2].value=nvidia \
--set-string toolkit.env[3].name=CONTAINERD_SET_AS_DEFAULT \
--set-string toolkit.env[3].value=true`);

      // Check gpu drivers
      shellExec(
        `break;kubectl get nodes -o json | jq '.items[].metadata.labels | keys | any(startswith("feature.node.kubernetes.io"))'`,
      );
      break;
    }

    case 'kubeflow-spark-operator': {
      // Use case:
      // Data Processing Pipelines: Used for ETL tasks where Spark can handle large data volumes efficiently.
      // Real-Time Analytics: Processing data from streaming sources (e.g., Kafka) for real-time analytics.
      // Machine Learning and Data Science: Training and deploying machine learning models at scale using Spark MLlib.

      shellExec(`helm repo add spark-operator https://kubeflow.github.io/spark-operator`);
      shellExec(`helm install spark-operator spark-operator/spark-operator \
  --namespace spark-operator \
  --create-namespace \
  --wait`);

      const image = `spark:3.5.5`;
      shellExec(`sudo docker pull ${image}`);
      if (!process.argv.includes('kubeadm'))
        shellExec(
          `sudo ${
            process.argv.includes('kubeadm') ? `ctr -n k8s.io images import` : `kind load docker-image`
          } ${image}`,
        );
      shellExec(`kubectl apply -f ./manifests/deployment/spark/spark-pi-py.yaml`);

      // Check the status of the Spark job:
      // kubectl get sparkapplications.sparkoperator.k8s.io -n default
      // kubectl get sparkapplication

      // Check case log:
      // kubectl logs -f spark-pi-python-driver
      // kubectl logs -f spark-pi-python-driver | grep Pi
      // kubectl describe sparkapplication spark-gpu-test

      // Uninstall:
      // kubectl delete sparkapplications.sparkoperator.k8s.io spark-pi-python -n default
      // helm delete spark-operator -n spark-operator

      // Gpu plugins:
      // https://github.com/NVIDIA/spark-rapids
      // RAPIDS Accelerator
      break;
    }

    case 'udpate-version-files': {
      const oldNpmVersion = process.argv[3];
      const oldNodeVersion = process.argv[4];
      const oldNodeMajorVersion = oldNodeVersion.split('.')[0];
      const nodeVersion = shellExec(`node --version`, { stdout: true }).trim().replace('v', '');
      const newNodeMajorVersion = nodeVersion.split('.')[0];
      const npmVersion = shellExec(`npm --version`, { stdout: true }).trim();

      fs.writeFileSync(
        `README.md`,
        fs
          .readFileSync(`README.md`, 'utf8')
          .replaceAll(oldNodeVersion, nodeVersion)
          .replaceAll(oldNpmVersion, npmVersion),
      );
      fs.writeFileSync(
        `manifests/lxd/underpost-setup.sh`,
        fs
          .readFileSync(`manifests/lxd/underpost-setup.sh`, 'utf8')
          .replaceAll(oldNodeVersion, nodeVersion)
          .replaceAll(oldNpmVersion, npmVersion),
      );
      fs.writeFileSync(
        `src/client/public/nexodev/docs/references/Getting started.md`,
        fs
          .readFileSync(`src/client/public/nexodev/docs/references/Getting started.md`, 'utf8')
          .replaceAll(oldNodeVersion, nodeVersion)
          .replaceAll(oldNpmVersion, npmVersion),
      );

      const workflowFiles = [
        `./.github/workflows/coverall.ci.yml`,

        `./.github/workflows/engine-core.ci.yml`,

        `./.github/workflows/engine-cyberia.ci.yml`,

        `./.github/workflows/engine-lampp.ci.yml`,

        `./.github/workflows/engine-test.ci.yml`,

        `./.github/workflows/ghpkg.ci.yml`,

        `./.github/workflows/npmpkg.ci.yml`,

        `./.github/workflows/publish.ci.yml`,

        `./.github/workflows/pwa-microservices-template-page.cd.yml`,

        `./.github/workflows/pwa-microservices-template-test.ci.yml`,

        `./.github/workflows/test-api-rest.cd.yml`,

        `./src/runtime/lampp/Dockerfile`,

        `./Dockerfile`,
      ];

      workflowFiles.forEach((file) => {
        fs.writeFileSync(
          file,
          fs
            .readFileSync(file, 'utf8')
            .replaceAll(oldNodeMajorVersion + '.x', newNodeMajorVersion + '.x')
            .replaceAll(oldNodeVersion, nodeVersion)
            .replaceAll(oldNpmVersion, npmVersion),
        );
      });
      break;
    }

    case 'sbt': {
      // https://www.scala-sbt.org/1.x/docs/Installing-sbt-on-Linux.html

      // sudo rm -f /etc/yum.repos.d/bintray-rpm.repo
      // curl -L https://www.scala-sbt.org/sbt-rpm.repo > sbt-rpm.repo
      // sudo mv sbt-rpm.repo /etc/yum.repos.d/
      // sudo yum install sbt
      break;
    }

    case 'ssl': {
      fs.mkdirSync(`./engine-private/ssl/localhost`, { recursive: true });
      const targetDir = `./engine-private/ssl/localhost`;
      const domains = ['localhost', '127.0.0.1', '::1'];
      shellExec(`chmod +x ./scripts/ssl.sh`);
      shellExec(`./scripts/ssl.sh ${targetDir} "${domains.join(' ')}"`);
      break;
    }
  }
} catch (error) {
  logger.error(error, error.stack);
}
