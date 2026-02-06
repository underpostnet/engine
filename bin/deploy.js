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
import colors from 'colors';
import { program } from '../src/cli/index.js';
import { timer } from '../src/client/components/core/CommonJs.js';
import Underpost from '../src/index.js';

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

      if (!['current', 'clean', 'root'].includes(process.argv[3])) {
        const path = fs.existsSync(`./engine-private/replica/${process.argv[3]}`)
          ? `./engine-private/replica/${process.argv[3]}/.env.${process.argv[4]}`
          : `./engine-private/conf/${process.argv[3]}/.env.${process.argv[4]}`;
        dotenv.config({ path, override: true });
      }

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
              serverConf[host][path].liteBuild = false;
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
          const deployPackage = JSON.parse(fs.readFileSync(filePah, 'utf8'));
          deployPackage.dependencies = originPackage.dependencies;
          deployPackage.devDependencies = originPackage.devDependencies;
          fs.writeFileSync(filePah, JSON.stringify(deployPackage, null, 4), 'utf8');
        }
      }
      break;

    case 'sync-env-port':
      const dataDeploy = getDataDeploy({ disableSyncEnvPort: true });
      const dataEnv = [
        { env: 'production', port: 3000 },
        { env: 'development', port: 4000 },
        { env: 'test', port: 5000 },
      ];
      let portOffset = 0;
      for (const deployIdObj of dataDeploy) {
        const { deployId } = deployIdObj;
        const baseConfPath = fs.existsSync(`./engine-private/replica/${deployId}`)
          ? `./engine-private/replica`
          : `./engine-private/conf`;
        for (const envInstanceObj of dataEnv) {
          const envPath = `${baseConfPath}/${deployId}/.env.${envInstanceObj.env}`;
          const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
          envObj.PORT = `${envInstanceObj.port + portOffset}`;

          writeEnv(envPath, envObj);
        }
        const serverConf = loadReplicas(
          deployId,
          JSON.parse(fs.readFileSync(`${baseConfPath}/${deployId}/conf.server.json`, 'utf8')),
        );
        for (const host of Object.keys(serverConf)) {
          for (const path of Object.keys(serverConf[host])) {
            if (serverConf[host][path].singleReplica) {
              portOffset--;
              continue;
            }
            portOffset++;
            if (serverConf[host][path].peer) portOffset++;
          }
        }
      }
      break;

    case 'build-single-replica': {
      const deployId = process.argv[3];
      const host = process.argv[4];
      const path = process.argv[5];
      const serverConf = loadReplicas(
        deployId,
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

    case 'version-build': {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      shellCd(`/home/dd/engine`);
      Underpost.repo.clean({ paths: ['/home/dd/engine', '/home/dd/engine/engine-private '] });
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
      Underpost.repo.clean({ paths: ['/home/dd/engine', '/home/dd/engine/engine-private '] });
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
        shellExec(`node bin new --dev --default-conf --deploy-id ${deployId}`);
      }
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin new --deploy-id dd-default`);
      console.log(fs.existsSync(`./engine-private/conf/dd-default`));
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin/deploy build-envs`);
      break;
    }

    case 'version-deploy': {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      shellExec(
        `underpost secret underpost --create-from-file /home/dd/engine/engine-private/conf/dd-cron/.env.production`,
      );
      shellExec(`node bin/deploy sync-envs`);
      shellExec(`node bin/build dd conf`);
      shellExec(`git add . && cd ./engine-private && git add .`);
      shellExec(`node bin cmt . ci package-pwa-microservices-template 'New release v:${process.argv[3]}'`);
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
        shellExec(`sudo rpm -e pgdg-redhat-repo-$(rpm -q pgdg-redhat-repo --qf '%{VERSION}-%{RELEASE}')`);
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
      const commissioningDeviceIp = Underpost.dns.getLocalIPv4Address();
      for (const port of ['5240']) {
        const name = 'maas';
        cmd.push(`${name}:${port}-${port}:${commissioningDeviceIp}`);
      }
      pbcopy(`node engine-private/r create-port ${cmd}`);
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
          `node bin image --build --path ${path}/backend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'} --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('build-front')) {
        const imageName = `fastapi-frontend:latest`;
        shellExec(`sudo podman pull docker.io/library/node:20`);
        shellExec(`sudo podman pull docker.io/library/nginx:1`);
        shellExec(`sudo rm -rf ${path}/${imageName.replace(':', '_')}.tar`);
        const args = [
          `node bin image --build --path ${path}/frontend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'} --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('secret')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        {
          const secretSelector = `fastapi-postgres-credentials`;
          shellExec(`sudo kubectl delete secret ${secretSelector} -n ${namespace} --ignore-not-found`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-literal=POSTGRES_DB=postgresdb` +
              ` --from-literal=POSTGRES_USER=admin` +
              ` --from-file=POSTGRES_PASSWORD=/home/dd/engine/engine-private/postgresql-password` +
              ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
          );
        }
        {
          const secretSelector = `fastapi-backend-config-secret`;
          shellExec(`sudo kubectl delete secret ${secretSelector} -n ${namespace} --ignore-not-found`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-file=SECRET_KEY=/home/dd/engine/engine-private/postgresql-password` +
              ` --from-literal=FIRST_SUPERUSER=development@underpost.net` +
              ` --from-file=FIRST_SUPERUSER_PASSWORD=/home/dd/engine/engine-private/postgresql-password` +
              ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
          );
        }
      }
      if (process.argv.includes('run-back')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-deployment.yml -n ${namespace}`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-service.yml -n ${namespace}`);
      }
      if (process.argv.includes('run-front')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-deployment.yml -n ${namespace}`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-service.yml -n ${namespace}`);
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
      const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'kafka';
      const imageName = `doughgle/kafka-kraft`;
      shellExec(`docker pull ${imageName}`);
      if (!process.argv.includes('kubeadm'))
        shellExec(
          `${process.argv.includes('kubeadm') ? `ctr -n k8s.io images import` : `kind load docker-image`} ${imageName}`,
        );
      shellExec(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
      shellExec(`kubectl apply -f ./manifests/deployment/kafka/deployment.yaml -n ${namespace}`);
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
      const namespace = 'gpu-operator';
      shellExec(`kubectl create ns ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
      shellExec(`kubectl label --overwrite ns ${namespace} pod-security.kubernetes.io/enforce=privileged`);

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
      const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
      shellExec(`kubectl apply -f ./manifests/deployment/spark/spark-pi-py.yaml -n ${namespace}`);

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

    case 'update-static-guide': {
      fs.writeFileSync(
        `src/client/public/nexodev/docs/references/Static Site Generator Quick Reference.md`,
        fs.readFileSync(`examples/static-page/QUICK-REFERENCE.md`, 'utf8'),
      );
      fs.writeFileSync(
        `src/client/public/nexodev/docs/references/Static Site Generator Examples.md`,
        fs.readFileSync(`examples/static-page/README.md`, 'utf8'),
      );
      fs.writeFileSync(
        `src/client/public/nexodev/docs/references/Static Generator Guide.md`,
        fs.readFileSync(`examples/static-page/STATIC-GENERATOR-GUIDE.md`, 'utf8'),
      );
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
      pbcopy(`nvm alias default v${nodeVersion}`);
      break;
    }

    case 'tls': {
      fs.mkdirSync(`./engine-private/ssl/localhost`, { recursive: true });
      const targetDir = `./engine-private/ssl/${process.argv[3] ? process.argv[3] : 'localhost'}`;
      const domains = ['localhost', '127.0.0.1', '::1'].concat(process.argv[3] ? process.argv[3] : []);
      shellExec(`chmod +x ./scripts/ssl.sh`);
      shellExec(`./scripts/ssl.sh ${targetDir} "${domains.join(' ')}"`);
      break;
    }

    case 'build-envs': {
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

    case 'sync-envs': {
      for (const deployId of ['dd-cron'].concat(
        fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','),
      )) {
        for (const env of ['production', 'development', 'test']) {
          const _envObj = dotenv.parse(fs.readFileSync(`./engine-private/conf/${deployId}/.env.${env}`, 'utf8'));
          for (const env of []) {
            delete _envObj[env];
          }
          writeEnv(`./engine-private/conf/${deployId}/.env.${env}`, _envObj);
        }
      }
      break;
    }

    case 'envs': {
      shellExec(`node bin/deploy sync-envs`);
      shellExec(`node bin/deploy build-envs`);
      break;
    }

    case 'cyberia': {
      const { CyberiaDependencies } = await import(`../src/client/components/cyberia-portal/CommonCyberiaPortal.js`);
      for (const dep of Object.keys(CyberiaDependencies)) {
        const ver = CyberiaDependencies[dep];
        shellExec(`npm install ${dep}@${ver}`);
      }
      break;
    }

    case 'pw': {
      const help = `node bin/deploy pw <script-path> <from-path-in-pod> [to-path-on-local]`;
      const scriptPath = process.argv[3];
      const fromPath = process.argv[4];
      const toPath = process.argv[5] ? process.argv[5] : fromPath ? `/tmp/${fromPath.split('/').pop()}` : '';
      if (scriptPath === 'help') {
        logger.info(help);
        break;
      }
      if (fs.existsSync(toPath)) fs.removeSync(toPath);
      shellExec(`node bin/deploy pw-conf ${scriptPath}`);
      shellExec(`kubectl delete deployment playwright-server --ignore-not-found`);
      while (Underpost.deploy.get('playwright-server').length > 0) {
        logger.info(`Waiting for playwright-server deployment to be deleted...`);
        await timer(1000);
      }
      shellExec(`kubectl apply -f manifests/deployment/playwright/deployment.yaml`);
      const id = 'playwright-server';
      await Underpost.test.statusMonitor(id);
      const nameSpace = 'default';
      const [pod] = Underpost.deploy.get(id);
      const podName = pod.NAME;
      shellExec(`kubectl logs -f ${podName} -n ${nameSpace}`, {
        async: true,
      });
      (async () => {
        while (!Underpost.deploy.existsContainerFile({ podName, path: fromPath })) {
          await timer(1000);
          logger.info(`Waiting for file ${fromPath} in pod ${podName}...`);
        }
        shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${fromPath} ${toPath}`);
        if (toPath.match('.png') && fs.existsSync(toPath)) shellExec(`firefox ${toPath}`);
      })();
      break;
    }

    case 'pw-conf': {
      const scriptPath = process.argv[3];
      shellExec(`kubectl delete configmap playwright-script`);
      shellExec(`kubectl create configmap playwright-script \
  --from-file=script.js=${scriptPath} \
  --dry-run=client -o yaml | kubectl apply -f -
`);
      break;
    }
  }
} catch (error) {
  logger.error(error, error.stack);
}
