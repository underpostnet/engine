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
  getDeployGroupId,
  deployRun,
  getDataDeploy,
  buildReplicaId,
  Cmd,
  restoreMacroDb,
  fixDependencies,
  setUpProxyMaintenanceServer,
  writeEnv,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { range, setPad, timer, uniqueArray } from '../src/client/components/core/CommonJs.js';
import { MongooseDB } from '../src/db/mongo/MongooseDB.js';
import { Lampp } from '../src/runtime/lampp/Lampp.js';
import { DefaultConf } from '../conf.js';
import { JSONweb } from '../src/server/client-formatted.js';

import { Xampp } from '../src/runtime/xampp/Xampp.js';
import { ejs } from '../src/server/json-schema.js';
import { buildCliDoc } from '../src/cli/index.js';

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
      loadConf(process.argv[3], process.argv[4]);
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
        if (!process.argv[3]) process.argv[3] = 'default';
        const { deployId, folder } = loadConf(process.argv[3]);

        let argHost = process.argv[4] ? process.argv[4].split(',') : [];
        let argPath = process.argv[5] ? process.argv[5].split(',') : [];
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
              if (process.env.NODE_ENV === 'development' && process.argv.includes('static')) {
                serverConf[host][path].apiBaseProxyPath = '/';
                serverConf[host][path].apiBaseHost = `localhost:${parseInt(process.env.PORT) + 1}`;
              }
              if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                deployIdSingleReplicas = deployIdSingleReplicas.concat(
                  serverConf[host][path].replicas.map((replica) => buildReplicaId({ deployId, replica })),
                );

                // shellExec(Cmd.replica(deployId, host, path));
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

    case 'xampp': {
      const directory = 'c:/xampp/htdocs';
      const host = 'localhost';
      const port = 80;
      Xampp.removeRouter();
      Xampp.appendRouter(`  Listen ${port} 
               <VirtualHost *:${port}>
                DocumentRoot "${directory}"
                ServerName ${host}:${port}
      
                <Directory "${directory}">
                  Options Indexes FollowSymLinks MultiViews
                  AllowOverride All
                  Require all granted
                </Directory>
      
              </VirtualHost>
              `);
      if (Xampp.enabled() && Xampp.router) Xampp.initService({ daemon: true });
      break;
    }

    case 'adminer': {
      const directory = '/home/dd/engine/public/adminer';
      // const host = '127.0.0.1';
      const host = 'localhost';
      const port = 80;
      if (!process.argv.includes('server')) {
        if (fs.existsSync(directory)) fs.removeSync(directory);
        fs.mkdirSync(directory, { recursive: true });
        shellExec(`cd ${directory} && wget https://www.adminer.org/latest.php -O adminer.php`);
      }
      Lampp.removeRouter();
      Lampp.appendRouter(`  Listen ${port} 
         <VirtualHost *:${port}>
          DocumentRoot "${directory}"
          ServerName ${host}:${port}

          <Directory "${directory}">
            Options Indexes FollowSymLinks MultiViews
            AllowOverride All
            Require all granted
          </Directory>

        </VirtualHost>
        `);
      if (Lampp.enabled() && Lampp.router) Lampp.initService({ daemon: true });
      shellExec(`open /opt/lampp/apache2/conf/httpd.conf`);
      break;
    }

    case 'pma':
      {
        const directory = '/home/dd/engine/public/phpmyadmin';
        // const host = '127.0.0.1';
        const host = 'localhost';
        const port = 80;
        // data config path: /etc/phpmyadmin

        // The config.inc.php file is not required, and only needed for custom configurations

        // phpmyadmin will first refer to ./libraries/config.default.php to retrieve the default values.

        // If for some reason you need to modify the default values, and the ./config.inc.php
        // file doesn't exist, you will need to create one as per the Installation documentation.

        // You will also need to configure pmadb for some of phpmyadmin's special features such as bookmarks.

        // CREATE USER 'pma'@'localhost' IDENTIFIED VIA mysql_native_password USING 'pmapass';
        // GRANT SELECT, INSERT, UPDATE, DELETE ON `<pma_db>`.* TO 'pma'@'localhost';

        if (!process.argv.includes('server')) {
          // if (fs.existsSync(directory)) fs.removeSync(directory);
          shellExec(`sudo apt install phpmyadmin php-mbstring php-zip php-gd php-json php-curl`);
          shellExec(`sudo phpenmod mbstring`);
          shellExec(
            `cd /usr/share/phpmyadmin && git init && git add . && git commit -m "Base phpMyAdmin implementation"`,
          );
        }

        // if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
        // if (!fs.existsSync('./public/phpmyadmin/phpmyadmin'))
        //   fs.copySync('/usr/share/phpmyadmin', './public/phpmyadmin/phpmyadmin');

        Lampp.removeRouter();
        Lampp.appendRouter(`  Listen ${port} `);
        if (Lampp.enabled() && Lampp.router) Lampp.initService({ daemon: true });
        // shellExec(`open /opt/lampp/apache2/conf/httpd.conf`);

        // Create a link in /var/www like this:

        // sudo ln -s /usr/share/phpmyadmin /var/www/

        // Note: since 14.04 you may want to use /var/www/html/ instead of /var/www/

        // If that's not working for you, you need to include PHPMyAdmin inside apache configuration.

        // Open apache.conf using your favorite editor, mine is vim :)

        // sudo vim /etc/apache2/apache2.conf

        // Then add the following line:

        // Include /etc/phpmyadmin/apache.conf

        // For Ubuntu 15.04 and 16.04

        // sudo ln -s /etc/phpmyadmin/apache.conf /etc/apache2/conf-available/phpmyadmin.conf
        // sudo a2enconf phpmyadmin.conf
        // sudo service apache2 reload
        break;
        Lampp.appendRouter(`   Listen ${port}

        <VirtualHost *:${port}>
            DocumentRoot "${directory}"
            ServerName ${host}:${port}

            <Directory "${directory}">
              Options Indexes FollowSymLinks MultiViews
              AllowOverride All
              Require all granted
            </Directory>

          </VirtualHost>`);
        // phpMyAdmin default Apache configuration:
        Lampp.appendRouter(`

          Listen ${port}

          Alias /phpmyadmin /usr/share/phpmyadmin

<Directory /usr/share/phpmyadmin>
    Options Indexes FollowSymLinks
    DirectoryIndex index.php

    <IfModule mod_php5.c>
        AddType application/x-httpd-php .php

        php_flag magic_quotes_gpc Off
        php_flag track_vars On
        php_flag register_globals Off
        php_value include_path .
    </IfModule>

</Directory>

# Authorize for setup
<Directory /usr/share/phpmyadmin/setup>
    <IfModule mod_authn_file.c>
    AuthType Basic
    AuthName "phpMyAdmin Setup"
    AuthUserFile /etc/phpmyadmin/htpasswd.setup
    </IfModule>
    Require valid-user
</Directory>

# Disallow web access to directories that don't need it
<Directory /usr/share/phpmyadmin/libraries>
    Order Deny,Allow
    Deny from All
</Directory>
<Directory /usr/share/phpmyadmin/setup/lib>
    Order Deny,Allow
    Deny from All
</Directory>

          `);
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

    case 'run-macro':
      {
        if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
        const dataDeploy = getDataDeploy({
          deployGroupId: process.argv[3],
          buildSingleReplica: true,
          deployIdConcat: ['dd-proxy', 'dd-cron'],
        });
        if (!process.argv[4]) await setUpProxyMaintenanceServer({ deployGroupId: process.argv[3] });
        await deployRun(process.argv[4] ? dataDeploy.filter((d) => d.deployId.match(process.argv[4])) : dataDeploy);
      }
      break;

    case 'build-macro':
      {
        const dataDeploy = getDataDeploy({ deployGroupId: process.argv[3], buildSingleReplica: true });
        for (const deploy of dataDeploy) {
          if (!process.argv[4] || (process.argv[4] && process.argv[4] === deploy.deployId)) {
            shellExec(Cmd.conf(deploy.deployId));
            shellExec(Cmd.build(deploy.deployId));
          }
        }
      }
      break;
    case 'macro': {
      shellExec(`git checkout .`);
      shellExec(`node bin/deploy build-macro ${process.argv.slice(3).join(' ')}`);
      shellExec(`git checkout .`);
      shellExec(`node bin/deploy run-macro ${process.argv.slice(3).join(' ')}`);
      break;
    }

    case 'keep-server': {
      await setUpProxyMaintenanceServer({ deployGroupId: process.argv[3] });
      break;
    }
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

          writeEnv(envPath, envObj);
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
        const plantuml = await import('plantuml');
        const folder = process.argv[3] ? process.argv[3] : `./src/client/public/default/plantuml`;
        const confData = Config.default;

        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        for (const typeConf of Object.keys(confData)) {
          logger.info(`generate ${typeConf} instance`);
          try {
            const svg = await plantuml(`
              @startjson
                ${JSON.stringify(confData[typeConf])}
              @endjson
            `);
            fs.writeFileSync(`${folder}/${typeConf}-conf.svg`, svg);
          } catch (error) {
            logger.error(error, error.stack);
          }
          logger.info(`generate ${typeConf} schema`);
          try {
            const svg = await plantuml(`
            @startjson
              ${JSON.stringify(ejs(confData[typeConf]))}
            @endjson
          `);
            fs.writeFileSync(`${folder}/${typeConf}-schema.svg`, svg);
          } catch (error) {
            logger.error(error, error.stack);
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
    case 'build-macro-replica':
      getDataDeploy({ deployGroupId: process.argv[3], buildSingleReplica: true });
      break;

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
      const originPackageJson = JSON.parse(fs.readFileSync(`package.json`, 'utf8'));
      const newVersion = process.argv[3] ?? originPackageJson.version;
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
        `./src/index.js`,
        fs.readFileSync(`./src/index.js`, 'utf8').replaceAll(`${version}`, `${newVersion}`),
        'utf8',
      );
      shellExec(`node bin/deploy cli-docs`);
      shellExec(`node bin/deploy update-dependencies`);
      shellExec(`auto-changelog`);
      shellExec(`node bin/build dd`);
      shellExec(`node bin deploy dd --build-manifest --sync --info-router`);
      shellExec(`node bin deploy dd production --build-manifest --sync --info-router`);
      break;
    }

    case 'version-deploy': {
      shellExec(`node bin/build dd conf`);
      shellExec(`git add . && cd ./engine-private && git add .`);
      shellExec(`node bin cmt . ci package-pwa-microservices-template`);
      shellExec(`node bin cmt ./engine-private ci package-pwa-microservices-template`);
      shellExec(`node bin push . underpostnet/engine`);
      shellExec(`cd ./engine-private && node ../bin push . underpostnet/engine-private`);
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

    case 'restore-macro-db':
      {
        const deployGroupId = process.argv[3];
        const deployId = process.argv[4];
        await restoreMacroDb(deployGroupId, deployId);
      }

      break;

    case 'mongo': {
      await MongooseDB.server();
      break;
    }

    case 'lampp': {
      await Lampp.install();
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

    case 'fix-deps': {
      await fixDependencies();
      break;
    }

    case 'update-default-conf': {
      const defaultServer = DefaultConf.server['default.net']['/'];
      let confName = process.argv[3];
      if (confName === 'ghpkg') {
        confName = undefined;
        const host = 'underpostnet.github.io';
        const path = '/pwa-microservices-template-ghpkg';
        DefaultConf.server = {
          [host]: { [path]: defaultServer },
        };
        DefaultConf.server[host][path].apiBaseProxyPath = '/';
        DefaultConf.server[host][path].apiBaseHost = 'www.nexodev.org';
      } else if (confName) {
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
      const targetConfPath = `./conf${confName ? `.${confName}` : ''}.js`;
      fs.writeFileSync(targetConfPath, confRawPaths.join(sepRender), 'utf8');
      shellExec(`prettier --write ${targetConfPath}`);

      break;
    }
    case 'ssh-export-server-keys': {
      fs.copyFile('/etc/ssh/ssh_host_rsa_key', './engine-private/deploy/ssh_host_rsa_key');
      fs.copyFile('/etc/ssh/ssh_host_rsa_key.pub', './engine-private/deploy/ssh_host_rsa_key.pub');
      break;
    }
    case 'ssh-import-server-keys': {
      fs.copyFile('./engine-private/deploy/ssh_host_rsa_key', '/etc/ssh/ssh_host_rsa_key');
      fs.copyFile('./engine-private/deploy/ssh_host_rsa_key.pub', '/etc/ssh/ssh_host_rsa_key.pub');
      break;
    }
    case 'ssh-import-client-keys': {
      const host = process.argv[3];
      shellExec(
        `node bin/deploy set-ssh-keys ./engine-private/deploy/ssh_host_rsa_key ${host ? ` ${host}` : ``} ${
          process.argv.includes('clean') ? 'clean' : ''
        }`,
      );
      break;
    }
    case 'ssh-keys': {
      // create ssh keys
      const sshAccount = process.argv[3]; // [sudo username]@[host/ip]
      const destPath = process.argv[4];
      // shellExec(`ssh-keygen -t ed25519 -C "${sshAccount}" -f ${destPath}`);
      if (fs.existsSync(destPath)) {
        fs.removeSync(destPath);
        fs.removeSync(destPath + '.pub');
      }
      shellExec(`ssh-keygen -t rsa -b 4096 -C "${sshAccount}" -f ${destPath}`);
      // add host to keyscan
      // shellExec(`ssh-keyscan -t rsa ${sshAccount.split(`@`)[1]} >> ~/.ssh/known_hosts`);
      break;
    }

    case 'set-ssh-keys': {
      const files = ['authorized_keys', 'id_rsa', 'id_rsa.pub', 'known_hosts ', 'known_hosts.old'];

      // > write
      // >> append

      // /root/.ssh/id_rsa
      // /root/.ssh/id_rsa.pub
      if (process.argv.includes('clean')) {
        for (const file of files) {
          if (fs.existsSync(`/root/.ssh/${file}`)) {
            logger.info('remove', `/root/.ssh/${file}`);
            fs.removeSync(`/root/.ssh/${file}`);
          }
          fs.writeFileSync(`/root/.ssh/${file}`, '', 'utf8');
        }
        shellExec('eval `ssh-agent -s`' + ` && ssh-add -D`);
      }

      const destPath = process.argv[3];
      const sshAuthKeyTarget = '/root/.ssh/authorized_keys';
      if (!fs.existsSync(sshAuthKeyTarget)) shellExec(`touch ${sshAuthKeyTarget}`);
      shellExec(`cat ${destPath}.pub > ${sshAuthKeyTarget}`);
      shellExec(`cat ${destPath} >> ${sshAuthKeyTarget}`);

      if (!fs.existsSync('/root/.ssh/id_rsa')) shellExec(`touch ${'/root/.ssh/id_rsa'}`);
      shellExec(`cat ${destPath} > ${'/root/.ssh/id_rsa'}`);

      if (!fs.existsSync('/root/.ssh/id_rsa.pub')) shellExec(`touch ${'/root/.ssh/id_rsa.pub'}`);
      shellExec(`cat ${destPath}.pub > ${'/root/.ssh/id_rsa.pub'}`);

      shellExec(`chmod 700 /root/.ssh/`);
      for (const file of files) {
        shellExec(`chmod 600 /root/.ssh/${file}`);
      }
      const host = process.argv[4];
      // add key
      shellExec('eval `ssh-agent -s`' + ' && ssh-add /root/.ssh/id_rsa' + ' && ssh-add -l');
      if (host) shellExec(`ssh-keyscan -H ${host} >> ~/.ssh/known_hosts`);
      shellExec(`sudo systemctl enable ssh`);
      shellExec(`sudo systemctl restart ssh`);
      shellExec(`sudo systemctl status ssh`);

      break;
    }

    case 'ssh': {
      if (process.argv.includes('rocky')) {
        shellExec(`sudo systemctl enable sshd`);

        shellExec(`sudo systemctl start sshd`);

        shellExec(`sudo systemctl status sshd`);

        shellExec(`sudo ss -lt`);
      } else {
        if (!process.argv.includes('server')) {
          shellExec(`sudo apt update`);
          shellExec(`sudo apt install openssh-server -y`);
          shellExec(`sudo apt install ssh-askpass`);
        }
        shellExec(`sudo systemctl enable ssh`);
        shellExec(`sudo systemctl restart ssh`);
        shellExec(`sudo systemctl status ssh`);
      }
      // sudo service ssh restart
      shellExec(`ip a`);

      // adduser newuser
      // usermod -aG sudo newuser

      // ssh -i '/path/to/keyfile' username@server

      // ssh-keygen -t ed25519 -C "your_email@example.com" -f $HOME/.ssh/id_rsa

      // legacy: ssh-keygen -t rsa -b 4096 -C "your_email@example.com" -f $HOME/.ssh/id_rsa

      // vi .ssh/authorized_keys
      // chmod 700 .ssh
      // chmod 600 authorized_keys

      // cat id_rsa.pub > .ssh/authorized_keys

      // add public key to authorized keys
      // cat .ssh/id_ed25519.pub | ssh [sudo username]@[host/ip] 'cat >> .ssh/authorized_keys'

      // 2. Open /etc/ssh/sshd_config file
      // nano /etc/ssh/sshd_config

      // 3. add example code to last line of file
      // Match User newuser
      //   PasswordAuthentication yes

      // ssh [sudo username]@[host/ip]
      // open port 22

      // init ssh agent service
      // eval `ssh-agent -s`

      // list keys
      // ssh-add -l

      // add key
      // ssh-add /root/.ssh/id_rsa

      // remove
      // ssh-add -d /path/to/private/key

      // remove all
      // ssh-add -D

      // sshpass -p ${{ secrets.PSWD }} ssh -o StrictHostKeyChecking=no -p 22 ${{ secrets.USER}}@${{ secrets.VPS_IP }} 'cd /home/adam && ./deploy.sh'

      // copies the public key of your default identity (use -i identity_file for other identities) to the remote host.
      // ssh-copy-id user@hostname.example.com
      // ssh-copy-id "user@hostname.example.com -p <port-number>"

      break;
    }

    case 'valkey': {
      if (!process.argv.includes('server')) {
        if (process.argv.includes('rocky')) {
          // shellExec(`yum install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm`);
          // shellExec(`sudo percona-release enable valkey experimental`);
          shellExec(`sudo dnf install valkey`);
          shellExec(`chown -R valkey:valkey /etc/valkey`);
          shellExec(`chown -R valkey:valkey /var/lib/valkey`);
          shellExec(`chown -R valkey:valkey /var/log/valkey`);
          shellExec(`sudo systemctl enable valkey.service`);
          shellExec(`sudo systemctl start valkey`);
          shellExec(`valkey-cli ping`);
        } else {
          shellExec(`cd /home/dd && git clone https://github.com/valkey-io/valkey.git`);
          shellExec(`cd /home/dd/valkey && make`);
          shellExec(`apt install valkey-tools`); // valkey-cli
        }
      }
      if (process.argv.includes('rocky')) {
        shellExec(`sudo systemctl stop valkey`);
        shellExec(`sudo systemctl start valkey`);
      } else shellExec(`cd /home/dd/valkey && ./src/valkey-server`);

      break;
    }

    case 'valkey-service': {
      shellExec(`pm2 start bin/deploy.js --node-args=\"--max-old-space-size=8192\" --name valkey -- valkey server`);
      break;
    }

    case 'update-instances': {
      shellExec(`node bin deploy dd production --sync --build-manifest --info-router --dashboard-update`);
      shellExec(`node bin cron --dashboard-update --init`);
      const deployId = 'dd-core';
      const host = 'www.nexodev.org';
      const path = '/';

      {
        const outputPath = './engine-private/instances';
        if (fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        const collection = 'instances';
        if (process.argv.includes('export'))
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        if (process.argv.includes('import'))
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
      }
      {
        const outputPath = './engine-private/crons';
        if (fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        const collection = 'crons';
        if (process.argv.includes('export'))
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        if (process.argv.includes('import'))
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
      }

      break;
    }

    case 'cli-docs': {
      buildCliDoc();
      break;
    }

    case 'monitor': {
      shellExec(`node bin monitor --type ${process.argv[3]} ${process.argv[4]} ${process.argv[5]}`, {
        async: true,
      });
      break;
    }

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
