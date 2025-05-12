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
  getUnderpostRootPath,
} from '../src/server/conf.js';
import { buildClient } from '../src/server/client-build.js';
import { range, s4, setPad, timer, uniqueArray } from '../src/client/components/core/CommonJs.js';
import { MongooseDB } from '../src/db/mongo/MongooseDB.js';
import { Lampp } from '../src/runtime/lampp/Lampp.js';
import { DefaultConf } from '../conf.js';
import { JSONweb } from '../src/server/client-formatted.js';

import { Xampp } from '../src/runtime/xampp/Xampp.js';
import { ejs } from '../src/server/json-schema.js';
import { buildCliDoc } from '../src/cli/index.js';
import { getLocalIPv4Address } from '../src/server/dns.js';
import { Downloader } from '../src/server/downloader.js';

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
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd`);
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd production`);
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
      shellExec(
        `node bin monitor ${process.argv[6] === 'sync' ? '--sync ' : ''}--type ${process.argv[3]} ${process.argv[4]} ${
          process.argv[5]
        }`,
        {
          async: true,
        },
      );
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

    case 'postgresql-14': {
      shellExec(`sudo /usr/pgsql-14/bin/postgresql-14-setup initdb`);
      shellExec(`sudo systemctl start postgresql-14`);
      shellExec(`sudo systemctl enable postgresql-14`);
      shellExec(`sudo systemctl status postgresql-14`);
      // sudo dnf install postgresql14-contrib
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

    case 'maas': {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const IP_ADDRESS = getLocalIPv4Address();
      const serverip = IP_ADDRESS;
      const tftpRoot = process.env.TFTP_ROOT;
      const ipaddr = '192.168.1.83';
      const netmask = process.env.NETMASK;
      const gatewayip = process.env.GATEWAY_IP;

      let resources;
      try {
        resources = JSON.parse(
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-resources read`, {
            silent: true,
            stdout: true,
          }),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          architecture: o.architecture,
        }));
      } catch (error) {
        logger.error(error);
      }

      const machineFactory = (m) => ({
        system_id: m.interface_set[0].system_id,
        mac_address: m.interface_set[0].mac_address,
        hostname: m.hostname,
        status_name: m.status_name,
      });

      let machines;
      try {
        machines = JSON.parse(
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machines read`, {
            stdout: true,
            silent: true,
          }),
        ).map((m) => machineFactory(m));
      } catch (error) {
        logger.error(error);
      }

      if (process.argv.includes('db')) {
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
      }

      if (process.argv.includes('ls')) {
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-sources read`);
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} commissioning-scripts read`);
        // shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-source-selections read 60`);
        console.table(resources);
        console.table(machines);
        process.exit(0);
      }
      if (process.argv.includes('clear')) {
        for (const machine of machines) {
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machine delete ${machine.system_id}`);
        }
        // machines = [];
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries clear all=true`);
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries scan force=true`);
        process.exit(0);
      }
      if (process.argv.includes('grub-arm64')) {
        shellExec(`sudo dnf install grub2-efi-aa64-modules`);
        shellExec(`sudo dnf install grub2-efi-x64-modules`);
        // sudo grub2-mknetdir --net-directory=${tftpRoot} --subdir=/boot/grub --module-path=/usr/lib/grub/arm64-efi arm64-efi
        process.exit(0);
      }

      if (process.argv.includes('psql')) {
        const cmd = `psql -U ${process.env.DB_PG_MAAS_USER} -h ${process.env.DB_PG_MAAS_HOST} -W ${process.env.DB_PG_MAAS_NAME}`;
        pbcopy(cmd);
        process.exit(0);
      }
      if (process.argv.includes('logs')) {
        shellExec(`maas status`);
        const cmd = `journalctl -f -t dhcpd -u snap.maas.pebble.service`;
        pbcopy(cmd);
        process.exit(0);
      }
      if (process.argv.includes('reset')) {
        // shellExec(
        //   `maas init region+rack --database-uri "postgres://$DB_PG_MAAS_USER:$DB_PG_MAAS_PASS@$DB_PG_MAAS_HOST/$DB_PG_MAAS_NAME"` +
        //     ` --maas-url http://${IP_ADDRESS}:5240/MAAS`,
        // );
        const cmd =
          `maas init region+rack --database-uri "postgres://${process.env.DB_PG_MAAS_USER}:${process.env.DB_PG_MAAS_PASS}@${process.env.DB_PG_MAAS_HOST}/${process.env.DB_PG_MAAS_NAME}"` +
          ` --maas-url http://${IP_ADDRESS}:5240/MAAS`;
        pbcopy(cmd);
        process.exit(0);
      }
      if (process.argv.includes('dhcp')) {
        const snippets = JSON.parse(
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} dhcpsnippets read`, {
            stdout: true,
            silent: true,
            disableLog: true,
          }),
        );
        for (const snippet of snippets) {
          switch (snippet.name) {
            case 'arm64':
              snippet.value = snippet.value.split(`\n`);
              snippet.value[1] = `          filename "http://${IP_ADDRESS}:5248/images/bootloaders/uefi/arm64/grubaa64.efi";`;
              snippet.value[5] = `          filename "http://${IP_ADDRESS}:5248/images/bootloaders/uefi/arm64/grubaa64.efi";`;
              snippet.value = snippet.value.join(`\n`);
              shellExec(
                `maas ${process.env.MAAS_ADMIN_USERNAME} dhcpsnippet update ${snippet.name} value='${snippet.value}'`,
              );
              break;

            default:
              break;
          }
        }

        console.log(snippets);

        process.exit(0);
      }
      // shellExec(`MAAS_ADMIN_USERNAME=${process.env.MAAS_ADMIN_USERNAME}`);
      // shellExec(`MAAS_ADMIN_EMAIL=${process.env.MAAS_ADMIN_EMAIL}`);
      // shellExec(`maas createadmin --username $MAAS_ADMIN_USERNAME --email $MAAS_ADMIN_EMAIL`);

      // MaaS admin CLI:
      // maas login <maas-admin-username> http://localhost:5240/MAAS
      // paste GUI API KEY (profile section)

      // Import custom image
      // maas <maas-admin-username> boot-resources create name='custom/RockyLinuxRpi4' \
      // title='RockyLinuxRpi4' \
      // architecture='arm64/generic' \
      // filetype='tgz' \
      // content@=/home/RockyLinuxRpi_9-latest.tar.gz

      // Image boot resource:
      // /var/snap/maas/current/root/snap/maas
      // /var/snap/maas/common/maas/tftp_root
      // sudo chmod 755 /var/snap/maas/common/maas/tftp_root

      // /var/snap/maas/common/maas/dhcpd.conf
      // sudo snap restart maas.pebble

      // PXE Linux files:
      // /var/snap/maas/common/maas/image-storage/bootloaders/pxe/i386
      // sudo nmcli con modify <interface-device-name-connection-id> ethtool.feature-rx on ethtool.feature-tx off
      // sudo nmcli connection up <interface-device-name-connection-id>

      // man nm-settings |grep feature-tx-checksum

      // nmcli c modify <interface-device-name-connection-id> \
      //  ethtool.feature-tx-checksum-fcoe-crc off \
      //  ethtool.feature-tx-checksum-ip-generic off \
      //  ethtool.feature-tx-checksum-ipv4 off \
      //  ethtool.feature-tx-checksum-ipv6 off \
      //  ethtool.feature-tx-checksum-sctp off

      // Ensure Rocky NFS server and /etc/exports configured
      // sudo systemctl restart nfs-server
      // Check mounts: showmount -e <server-ip>
      // Check nfs ports: rpcinfo -p
      // sudo chown -R root:root /nfs-export/rpi4mb
      // sudo chmod 755 /nfs-export/rpi4mb

      // tftp server
      // sudo chown -R root:root /var/snap/maas/common/maas/tftp_root/rpi4mb

      // tftp client
      // sudo dnf install tftp
      // tftp <server-ip> -c get <path>

      // Check firewall-cmd
      // firewall-cmd --permanent --add-service=rpc-bind
      // firewall-cmd --reload

      // Image extension transform (.img.xz to .tar.gz):
      // tar -cvzf image-name.tar.gz image-name.img.xz

      // Rocky network configuration:
      // /etc/NetworkManager/system-connections

      // Rocky kernel params update
      // sudo grubby --args="<key>=<value> <key>=<value>" --update-kernel=ALL
      // sudo reboot now

      // Temporal:
      // sudo snap install temporal
      // journalctl -u snap.maas.pebble -t maas-regiond
      // journalctl -u snap.maas.pebble -t maas-temporal -n 100 --no-pager -f

      // Remove:
      // sudo dnf remove <package> -y; sudo dnf autoremove -y; sudo dnf clean packages
      // check: ~
      // check: ~./cache
      // check: ~./config

      // Check file logs
      // grep -i -E -C 1 '<key-a>|<key-b>' /example.log | tail -n 600

      // Back into your firmware setup (UEFI or BIOS config screen).
      // grub> fwsetup

      // Poweroff:
      // grub > halt
      // initramfs > poweroff

      // Check interface
      // ip link show
      // nmcli con show

      let firmwarePath,
        tftpSubDir,
        kernelFilesPaths,
        name,
        architecture,
        resource,
        nfsConnectStr,
        etcExports,
        nfsServerRootPath,
        bootConf,
        zipFirmwareFileName,
        zipFirmwareName,
        zipFirmwareUrl,
        interfaceName,
        nfsHost;

      switch (process.argv[3]) {
        case 'rpi4mb':
          const resourceId = process.argv[4] ?? '39';
          tftpSubDir = '/rpi4mb';
          zipFirmwareFileName = `RPi4_UEFI_Firmware_v1.41.zip`;
          zipFirmwareName = zipFirmwareFileName.split('.zip')[0];
          zipFirmwareUrl = `https://github.com/pftf/RPi4/releases/download/v1.41/RPi4_UEFI_Firmware_v1.41.zip`;
          firmwarePath = `../${zipFirmwareName}`;
          interfaceName = process.env.RPI4_INTERFACE_NAME;
          nfsHost = 'rpi4mb';
          if (!fs.existsSync(firmwarePath)) {
            await Downloader(zipFirmwareUrl, `../${zipFirmwareFileName}`);
            shellExec(`cd .. && mkdir ${zipFirmwareName} && cd ${zipFirmwareName} && unzip ../${zipFirmwareFileName}`);
          }
          resource = resources.find((o) => o.id == resourceId);
          name = resource.name;
          architecture = resource.architecture;
          resource = resources.find((o) => o.name === name && o.architecture === architecture);
          nfsServerRootPath = `/nfs-export/rpi4mb`;
          // ,anonuid=1001,anongid=100
          // etcExports = `${nfsServerRootPath} *(rw,all_squash,sync,no_root_squash,insecure)`;
          etcExports = `${nfsServerRootPath} 192.168.1.0/24(${[
            'rw',
            // 'all_squash',
            'sync',
            'no_root_squash',
            'no_subtree_check',
            'insecure',
          ]})`;
          const resourceData = JSON.parse(
            shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-resource read ${resource.id}`, {
              stdout: true,
              silent: true,
              disableLog: true,
            }),
          );
          const bootFiles = resourceData.sets[Object.keys(resourceData.sets)[0]].files;
          const suffix = architecture.match('xgene') ? '.xgene' : '';

          kernelFilesPaths = {
            'vmlinuz-efi': bootFiles['boot-kernel' + suffix].filename_on_disk,
            'initrd.img': bootFiles['boot-initrd' + suffix].filename_on_disk,
            squashfs: bootFiles['squashfs'].filename_on_disk,
          };
          const protocol = 'tcp'; // v3 -> tcp, v4 -> udp

          const mountOptions = [
            protocol,
            'vers=3',
            'nfsvers=3',
            'nolock',
            // 'protocol=tcp',
            // 'hard=true',
            'port=2049',
            // 'sec=none',
            'rw',
            'hard',
            'intr',
            'rsize=32768',
            'wsize=32768',
            'acregmin=0',
            'acregmax=0',
            'acdirmin=0',
            'acdirmax=0',
            'noac',
            // 'nodev',
            // 'nosuid',
          ];
          const cmd = [
            `console=serial0,115200`,
            `console=tty1`,
            // `initrd=-1`,
            // `net.ifnames=0`,
            // `dwc_otg.lpm_enable=0`,
            // `elevator=deadline`,
            `root=/dev/nfs`,
            `nfsroot=${serverip}:/nfs-export/rpi4mb,${mountOptions}`,
            // `nfsroot=${serverip}:/nfs-export/rpi4mb`,
            `ip=${ipaddr}:${serverip}:${gatewayip}:${netmask}:${nfsHost}:${interfaceName}:static`,
            `rootfstype=nfs`,
            `rw`,
            `rootwait`,
            `fixrtc`,
            'initrd=initrd.img',
            // 'boot=casper',
            // 'ro',
            'netboot=nfs',
            // 'ip=dhcp',
            // 'ip=dfcp',
            // 'autoinstall',
            // 'rd.break',
          ];

          nfsConnectStr = cmd.join(' ');
          bootConf = `[all]
MAC_ADDRESS=00:00:00:00:00:00
MAC_ADDRESS_OTP=0,1
BOOT_UART=0
WAKE_ON_GPIO=1
POWER_OFF_ON_HALT=0
ENABLE_SELF_UPDATE=1
DISABLE_HDMI=0
TFTP_IP=${serverip}
TFTP_PREFIX=1
TFTP_PREFIX_STR=${tftpSubDir.slice(1)}/
NET_INSTALL_ENABLED=1
DHCP_TIMEOUT=45000
DHCP_REQ_TIMEOUT=4000
TFTP_FILE_TIMEOUT=30000
BOOT_ORDER=0x21`;

          break;

        default:
          break;
      }
      shellExec(`sudo chmod 755 /nfs-export/${nfsHost}`);

      shellExec(`sudo rm -rf ${tftpRoot}${tftpSubDir}`);
      shellExec(`sudo cp -a ${firmwarePath} ${tftpRoot}${tftpSubDir}`);
      shellExec(`mkdir -p ${tftpRoot}${tftpSubDir}/pxe`);

      fs.writeFileSync(`/etc/exports`, etcExports, 'utf8');
      if (bootConf) fs.writeFileSync(`${tftpRoot}${tftpSubDir}/boot.conf`, bootConf, 'utf8');

      shellExec(`node bin/deploy nfs`);

      if (process.argv.includes('restart')) {
        shellExec(`sudo snap restart maas.pebble`);
        let secs = 0;
        while (
          !(
            shellExec(`maas status`, { silent: true, disableLog: true, stdout: true })
              .split(' ')
              .filter((l) => l.match('inactive')).length === 1
          )
        ) {
          await timer(1000);
          console.log(`Waiting... (${++secs}s)`);
        }
      }

      switch (process.argv[3]) {
        case 'rpi4mb':
          {
            // subnet DHCP snippets
            // # UEFI ARM64
            // if option arch = 00:0B {
            //   filename "rpi4mb/pxe/grubaa64.efi";
            // }
            // elsif option arch = 00:13 {
            //   filename "http://<IP_ADDRESS>:5248/images/bootloaders/uefi/arm64/grubaa64.efi";
            //   option vendor-class-identifier "HTTPClient";
            // }
            for (const file of ['bootaa64.efi', 'grubaa64.efi']) {
              shellExec(
                `sudo cp -a /var/snap/maas/common/maas/image-storage/bootloaders/uefi/arm64/${file} ${tftpRoot}${tftpSubDir}/pxe/${file}`,
              );
            }
            // const file = 'bcm2711-rpi-4-b.dtb';
            // shellExec(
            //   `sudo cp -a  ${firmwarePath}/${file} /var/snap/maas/common/maas/image-storage/bootloaders/uefi/arm64/${file}`,
            // );

            // const ipxeSrc = fs
            //   .readFileSync(`${tftpRoot}/ipxe.cfg`, 'utf8')
            //   .replaceAll('amd64', 'arm64')
            //   .replaceAll('${next-server}', IP_ADDRESS);
            // fs.writeFileSync(`${tftpRoot}/ipxe.cfg`, ipxeSrc, 'utf8');

            {
              for (const file of Object.keys(kernelFilesPaths)) {
                shellExec(
                  `sudo cp -a /var/snap/maas/common/maas/image-storage/${kernelFilesPaths[file]} ${tftpRoot}${tftpSubDir}/pxe/${file}`,
                );
              }
              // const configTxtSrc = fs.readFileSync(`${firmwarePath}/config.txt`, 'utf8');
              // fs.writeFileSync(
              //   `${tftpRoot}${tftpSubDir}/config.txt`,
              //   configTxtSrc
              //     .replace(`kernel=kernel8.img`, `kernel=vmlinuz`)
              //     .replace(`# max_framebuffers=2`, `max_framebuffers=2`)
              //     .replace(`initramfs initramfs8 followkernel`, `initramfs initrd.img followkernel`),
              //   'utf8',
              // );

              // grub:
              // set root=(pxe)

              // UNDERPOST.NET UEFI/GRUB/MAAS RPi4 commissioning (ARM64)
              const menuentryStr = 'underpost.net rpi4mb maas commissioning (ARM64)';
              const grubCfgPath = `${tftpRoot}/grub/grub.cfg`;
              fs.writeFileSync(
                grubCfgPath,
                `
    insmod gzio
    insmod http
    insmod nfs
    set timeout=5
    set default=0
    
    menuentry '${menuentryStr}' {
      set root=(tftp,${serverip}) 
      linux ${tftpSubDir}/pxe/vmlinuz-efi ${nfsConnectStr}
      initrd ${tftpSubDir}/pxe/initrd.img
      boot
    }
    
        `,
                'utf8',
              );
            }
            const arm64EfiPath = `${tftpRoot}/grub/arm64-efi`;
            if (fs.existsSync(arm64EfiPath)) shellExec(`sudo rm -rf ${arm64EfiPath}`);
            shellExec(`sudo cp -a /usr/lib/grub/arm64-efi ${arm64EfiPath}`);
          }

          break;

        default:
          break;
      }

      logger.info('succes maas deploy', {
        resource,
        kernelFilesPaths,
        tftpRoot,
        tftpSubDir,
        firmwarePath,
        etcExports,
        nfsServerRootPath,
        nfsConnectStr,
      });
      if (process.argv.includes('restart')) {
        if (fs.existsSync(`node engine-private/r.js`)) shellExec(`node engine-private/r`);
        shellExec(`node bin/deploy maas dhcp`);
        shellExec(`sudo chown -R root:root ${tftpRoot}`);
        shellExec(`sudo sudo chmod 755 ${tftpRoot}`);
      }
      for (const machine of machines) {
        // shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machine delete ${machine.system_id}`);
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machine commission ${machine.system_id}`, {
          silent: true,
        });
      }
      // machines = [];

      const monitor = async () => {
        // discoveries         Query observed discoveries.
        // discovery           Read or delete an observed discovery.

        const discoveries = JSON.parse(
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries read`, {
            silent: true,
            stdout: true,
          }),
        ).filter(
          (o) => o.ip !== IP_ADDRESS && o.ip !== gatewayip && !machines.find((_o) => _o.mac_address === o.mac_address),
        );

        //   {
        //     "discovery_id": "",
        //     "ip": "192.168.1.189",
        //     "mac_address": "00:00:00:00:00:00",
        //     "last_seen": "2025-05-05T14:17:37.354",
        //     "hostname": null,
        //     "fabric_name": "",
        //     "vid": null,
        //     "mac_organization": "",
        //     "observer": {
        //         "system_id": "",
        //         "hostname": "",
        //         "interface_id": 1,
        //         "interface_name": ""
        //     },
        //     "resource_uri": "/MAAS/api/2.0/discovery/MTkyLjE2OC4xLjE4OSwwMDowMDowMDowMDowMDowMA==/"
        // },

        for (const discovery of discoveries) {
          const machine = {
            architecture: architecture.match('amd') ? 'amd64/generic' : 'arm64/generic',
            mac_address: discovery.mac_address,
            hostname:
              discovery.hostname ?? discovery.mac_organization ?? discovery.domain ?? discovery.ip.match(ipaddr)
                ? nfsHost
                : `unknown-${s4()}`,
            // description: '',
            // https://maas.io/docs/reference-power-drivers
            power_type: 'manual', // manual
            // power_parameters_power_address: discovery.ip,
            mac_addresses: discovery.mac_address,
          };
          machine.hostname = machine.hostname.replaceAll(' ', '').replaceAll('.', '');

          try {
            let newMachine = shellExec(
              `maas ${process.env.MAAS_ADMIN_USERNAME} machines create ${Object.keys(machine)
                .map((k) => `${k}="${machine[k]}"`)
                .join(' ')}`,
              {
                silent: true,
                stdout: true,
              },
            );
            newMachine = machineFactory(JSON.parse(newMachine));
            machines.push(newMachine);
            console.log(newMachine);
            shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machine commission ${newMachine.system_id}`, {
              silent: true,
            });
          } catch (error) {
            logger.error(error, error.stack);
          }
        }
        // if (discoveries.length > 0) {
        //   shellExec(
        //     `maas ${process.env.MAAS_ADMIN_USERNAME} machines read | jq '.[] | {system_id: .interface_set[0].system_id, hostname, status_name, mac_address: .interface_set[0].mac_address}'`,
        //   );
        // }
        await timer(1000);
        monitor();
      };
      // shellExec(`node bin/deploy open-virtual-root ${architecture.match('amd') ? 'amd64' : 'arm64'} ${nfsHost}`);
      monitor();
      break;
    }

    case 'nfs': {
      // Daemon RPC  NFSv3. ports:

      // 2049 (TCP/UDP) – puerto estándar de nfsd.
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
      // sudo exportfs -u <client-ip>:/nfs-export/rpi4mb

      // Nfs client:
      // mount -t nfs <server-ip>:/server-mnt /mnt
      // umount /mnt

      shellExec(`sudo systemctl restart nfs-server`);
      break;
    }
    case 'open-virtual-root': {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const IP_ADDRESS = getLocalIPv4Address();
      const architecture = process.argv[3];
      const host = process.argv[4];
      const nftRootPath = `/nfs-export/${host}`;
      shellExec(`dnf install -y debootstrap`);
      switch (architecture) {
        case 'arm64':
          shellExec(`sudo podman run --rm --privileged multiarch/qemu-user-static --reset -p yes`);

          break;

        default:
          break;
      }

      shellExec(`sudo modprobe binfmt_misc`);
      shellExec(`sudo mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc`);

      if (process.argv.includes('build')) {
        let cmd;
        switch (host) {
          case 'rpi4mb':
            shellExec(`sudo rm -rf ${nftRootPath}/*`);
            shellExec(`sudo chown -R root:root ${nftRootPath}`);
            cmd = [
              `sudo debootstrap`,
              `--arch=arm64`,
              `--variant=minbase`,
              `--foreign`, // arm64 on amd64
              `noble`,
              nftRootPath,
              `http://ports.ubuntu.com/ubuntu-ports/`,
            ];
            break;

          default:
            break;
        }
        shellExec(cmd.join(' '));

        shellExec(`sudo podman create --name extract multiarch/qemu-user-static`);
        shellExec(`podman ps -a`);
        shellExec(`sudo podman cp extract:/usr/bin/qemu-aarch64-static ${nftRootPath}/usr/bin/`);
        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);

        switch (host) {
          case 'rpi4mb':
            shellExec(`file ${nftRootPath}/bin/bash`); // expected: ELF 64-bit LSB pie executable, ARM aarch64 …
            break;

          default:
            break;
        }

        shellExec(`sudo chroot ${nftRootPath} /usr/bin/qemu-aarch64-static /bin/bash <<'EOF'
/debootstrap/debootstrap --second-stage
EOF`);
      }
      if (process.argv.includes('mount')) {
        shellExec(`sudo mount --bind /proc ${nftRootPath}/proc`);
        shellExec(`sudo mount --bind /sys  ${nftRootPath}/sys`);
        shellExec(`sudo mount --rbind /dev  ${nftRootPath}/dev`);
      }

      if (process.argv.includes('build')) {
        switch (host) {
          case 'rpi4mb':
            // https://www.cyberciti.biz/faq/understanding-etcgroup-file/
            // https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/4/html/introduction_to_system_administration/s3-acctspgrps-group#s3-acctspgrps-group
            // shellExec(`grep '^root:'  ${nftRootPath}/etc/group`); // check group root
            // shellExec(`echo 'root:x:0:' | sudo tee -a  ${nftRootPath}/etc/group`); // set group root
            // console.log(`echo 'root:x:0:0:root:/root:/bin/bash' > ${nftRootPath}/nfs-export/rpi4mb/etc/passwd`);

            // apt install -y linux-lowlatency-hwe-22.04
            // chown -R ${process.env.MAAS_COMMISSION_USERNAME}:${process.env.MAAS_COMMISSION_USERNAME} /home/${
            //   process.env.MAAS_COMMISSION_USERNAME
            // }/.ssh
            // echo '${process.env.MAAS_COMMISSION_USERNAME}:${process.env.MAAS_COMMISSION_PASSWORD}' | chpasswd

            shellExec(`sudo chroot ${nftRootPath} /usr/bin/qemu-aarch64-static /bin/bash <<'EOF'
apt update
apt install -y sudo
apt install -y openssh-server
mkdir -p /home/${process.env.MAAS_COMMISSION_USERNAME}/.ssh
useradd -m -s /bin/bash -G sudo ${process.env.MAAS_COMMISSION_USERNAME}
echo "${process.env.MAAS_COMMISSION_USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu-nopasswd
chmod 0440 /etc/sudoers.d/ubuntu-nopasswd
echo '${fs.readFileSync(`/home/dd/engine/engine-private/deploy/dd.pub`, 'utf8')}' >> /home/${
              process.env.MAAS_COMMISSION_USERNAME
            }/.ssh/authorized_keys
chown -R ${process.env.MAAS_COMMISSION_USERNAME}:${process.env.MAAS_COMMISSION_USERNAME} /home/${
              process.env.MAAS_COMMISSION_USERNAME
            }
chmod 700 /home/${process.env.MAAS_COMMISSION_USERNAME}/.ssh
chmod 600 /home/${process.env.MAAS_COMMISSION_USERNAME}/.ssh/authorized_keys
systemctl enable ssh
apt install -y ntp
ln -sf /lib/systemd/systemd /sbin/init
apt install -y linux-generic-hwe-24.04
apt install -y cloud-init
mkdir -p /var/lib/cloud
chown -R root:root /var/lib/cloud
chmod -R 0755 /var/lib/cloud
cat <<EOF_MAAS_CFG > /etc/cloud/cloud.cfg.d/90_maas.cfg
datasource_list: [ MAAS ]
datasource:
  MAAS:
    metadata_url: http://${IP_ADDRESS}:5248/MAAS/metadata
users:
  - name: ${process.env.MAAS_ADMIN_USERNAME}
    ssh_authorized_keys:
      - ${fs.readFileSync(`/home/dd/engine/engine-private/deploy/dd.pub`, 'utf8')}
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    groups: sudo
    shell: /bin/bash
  - name: ${process.env.MAAS_COMMISSION_USERNAME}
    ssh_authorized_keys:
      - ${fs.readFileSync(`/home/dd/engine/engine-private/deploy/dd.pub`, 'utf8')}
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    groups: sudo
    shell: /bin/bash
packages:
  - git
  - htop
  - ufw
package_update: true
runcmd:
  - ufw enable
  - ufw allow ssh
resize_rootfs: False
growpart:
  mode: off
EOF_MAAS_CFG
mkdir -p /etc/network
cat <<EOF_NET > /etc/network/interfaces
auto lo
iface lo inet loopback

auto ${process.env.RPI4_INTERFACE_NAME}
iface ${process.env.RPI4_INTERFACE_NAME} inet dhcp
EOF_NET
EOF`);
            shellExec(`sudo tee -a ${nftRootPath}/etc/hosts <<EOF
127.0.0.1 ${process.env.MAAS_COMMISSION_USERNAME}
${IP_ADDRESS} ${process.env.MAAS_COMMISSION_USERNAME}
127.0.0.1 ${process.env.MAAS_COMMISSION_HOSTNAME}
${IP_ADDRESS} ${process.env.MAAS_COMMISSION_HOSTNAME}
EOF`);

            // check sudo
            // sudo -u ${process.env.MAAS_ADMIN_USERNAME} whoami
            // sudo whoami
            break;

          default:
            break;
        }
      }

      shellExec(`sudo chroot ${nftRootPath} /usr/bin/qemu-aarch64-static /bin/bash <<'EOF'
apt update
EOF`);

      break;
    }

    case 'close-virtual-root': {
      const architecture = process.argv[3];
      const host = process.argv[4];
      const nftRootPath = `/nfs-export/${host}`;
      shellExec(`sudo umount ${nftRootPath}/proc`);
      shellExec(`sudo umount ${nftRootPath}/sys`);
      shellExec(`sudo umount ${nftRootPath}/dev`);
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
      const ipaddr = getLocalIPv4Address();
      for (const port of ['5240']) {
        const name = 'maas';
        cmd.push(`${name}:${port}-${port}:${ipaddr}`);
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

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
