import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
import { shellExec } from '../src/server/process.js';
import dotenv from 'dotenv';
import { getCapVariableName } from '../src/client/components/core/CommonJs.js';
import {
  buildProxyRouter,
  buildPortProxyRouter,
  Config,
  getPathsSSR,
  buildKindPorts,
  loadReplicas,
} from '../src/server/conf.js';

const baseConfPath = './engine-private/conf/dd-cron/.env.production';
if (fs.existsSync(baseConfPath)) dotenv.config({ path: baseConfPath, override: true });

const logger = loggerFactory(import.meta);

// (async () => {
//   return;
//   const files = await fs.readdir(`./src`);
//   for (const relativePath of files) {
//   }
// })();

const confName = process.argv[2];
const basePath = '../pwa-microservices-template';
const repoName = `engine-${confName.split('dd-')[1]}`;
const privateRepoName = `${repoName}-private`;
const privateRepoNameBackUp = `${repoName}-cron-backups`;
const gitPrivateUrl = `https://${process.env.GITHUB_TOKEN}@github.com/underpostnet/${privateRepoName}.git`;
const gitPrivateBackUpUrl = `https://${process.env.GITHUB_TOKEN}@github.com/underpostnet/${privateRepoNameBackUp}.git`;

logger.info('', {
  confName,
  repoName,
  privateRepoName,
  privateRepoNameBackUp,
  basePath,
});

if (process.argv.includes('info')) process.exit(0);

if (process.argv.includes('clean')) {
  if (fs.existsSync(`${basePath}/images`)) fs.copySync(`${basePath}/images`, `./images`);
  shellExec(`cd ${basePath} && git checkout .`);
  shellExec(`cd ${basePath} && git clean -f -d`);
  process.exit(0);
}

if (process.argv.includes('proxy')) {
  const env = process.argv.includes('development') ? 'development' : 'production';
  process.env.NODE_ENV = env;
  process.env.PORT = process.env.NODE_ENV === 'development' ? 4000 : 3000;
  process.argv[2] = 'proxy';
  process.argv[3] = fs.readFileSync('./engine-private/deploy/dd-router', 'utf8').trim();

  await Config.build();
  process.env.NODE_ENV = 'production';

  const confServer = loadReplicas(
    JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.server.json`, 'utf8')),
  );
  const router = buildPortProxyRouter(443, buildProxyRouter());
  const confHosts = Object.keys(confServer);

  for (const host of Object.keys(router)) {
    if (!confHosts.find((_host) => host.match(_host))) {
      delete router[host];
    }
  }

  const ports = Object.values(router).map((p) => parseInt(p.split(':')[2]));

  const fromPort = Math.min(...ports);
  const toPort = Math.max(...ports);

  logger.info('port range', { fromPort, toPort, router });

  const deploymentYamlFilePath = `./engine-private/conf/${confName}/build/${env}/deployment.yaml`;

  const deploymentYamlParts = fs.readFileSync(deploymentYamlFilePath, 'utf8').split('ports:');
  deploymentYamlParts[1] =
    buildKindPorts(fromPort, toPort) +
    `  type: LoadBalancer
`;

  fs.writeFileSync(
    deploymentYamlFilePath,
    deploymentYamlParts.join(`ports:
`),
  );

  let proxyYaml = '';
  let secretYaml = '';

  for (const host of Object.keys(confServer)) {
    if (env === 'production')
      secretYaml += `
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${host}
spec:
  commonName: ${host}
  dnsNames:
  - ${host}
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  secretName: ${host}`;

    const pathPortConditions = [];
    for (const path of Object.keys(confServer[host])) {
      const { peer } = confServer[host][path];
      if (!router[`${host}${path === '/' ? '' : path}`]) continue;
      const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
      // logger.info('', { host, port, path });
      pathPortConditions.push({
        port,
        path,
      });

      if (peer) {
        //  logger.info('', { host, port: port + 1, path: '/peer' });
        pathPortConditions.push({
          port: port + 1,
          path: '/peer',
        });
      }
    }
    // logger.info('', { host, pathPortConditions });
    proxyYaml += `
---
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${host}
spec:
  virtualhost:
    fqdn: ${host}${
      env === 'development'
        ? ''
        : `
    tls:
      secretName: ${host}`
    }
  routes:`;
    for (const conditionObj of pathPortConditions) {
      const { path, port } = conditionObj;
      proxyYaml += `
    - conditions:
        - prefix: ${path}
      enableWebsockets: true
      services:
        - name: ${confName}-${env}-service
          port: ${port}`;
    }
  }
  const yamlPath = `./engine-private/conf/${confName}/build/${env}/proxy.yaml`;
  fs.writeFileSync(yamlPath, proxyYaml, 'utf8');
  if (env === 'production') {
    const yamlPath = `./engine-private/conf/${confName}/build/${env}/secret.yaml`;
    fs.writeFileSync(yamlPath, secretYaml, 'utf8');
  }

  process.exit(0);
}
if (process.argv.includes('conf')) {
  if (!fs.existsSync(`../${privateRepoName}`)) {
    shellExec(`cd .. && git clone ${gitPrivateUrl}`, { silent: true });
  } else {
    shellExec(`cd ../${privateRepoName} && git pull`);
  }
  const toPath = `../${privateRepoName}/conf/${confName}`;
  fs.removeSync(toPath);
  fs.mkdirSync(toPath, { recursive: true });
  fs.copySync(`./engine-private/conf/${confName}`, toPath);
  shellExec(
    `cd ../${privateRepoName}` +
      ` && git add .` +
      ` && git commit -m "ci(engine-core-conf): ⚙️ Update ${confName} conf"` +
      ` && git push`,
  );
  process.exit(0);
}

if (process.argv.includes('cron-backups')) {
  if (!fs.existsSync(`../${privateRepoNameBackUp}`)) {
    shellExec(`cd .. && git clone ${gitPrivateBackUpUrl}`, { silent: true });
  } else {
    shellExec(`cd ../${privateRepoNameBackUp} && git pull`);
  }
  const serverConf = JSON.parse(fs.readFileSync(`./engine-private/conf/${confName}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(serverConf)) {
    for (let path of Object.keys(serverConf[host])) {
      path = path.replaceAll('/', '-');
      const toPath = `../${privateRepoNameBackUp}/${host}${path}`;
      const fromPath = `./engine-private/cron-backups/${host}${path}`;
      if (fs.existsSync(fromPath)) {
        if (fs.existsSync(toPath)) fs.removeSync(toPath);
        logger.info('Build', { fromPath, toPath });
        fs.copySync(fromPath, toPath);
      }
    }
  }
  shellExec(
    `cd ../${privateRepoNameBackUp}` +
      ` && git add .` +
      ` && git commit -m "ci(engine-core-cron-backups): ⚙️ Update ${confName} cron backups"` +
      ` && git push`,
  );
  process.exit(0);
}

if (process.argv.includes('test')) {
  fs.mkdirSync(`${basePath}/engine-private/conf`, { recursive: true });
  fs.copySync(`./engine-private/conf/${confName}`, `${basePath}/engine-private/conf/${confName}`);
}

const { DefaultConf } = await import(`../conf.${confName}.js`);

{
  for (const host of Object.keys(DefaultConf.server)) {
    for (const path of Object.keys(DefaultConf.server[host])) {
      const { apis, ws } = DefaultConf.server[host][path];
      if (apis)
        for (const api of apis) {
          {
            const originPath = `./src/api/${api}`;
            logger.info(`Build`, originPath);
            fs.copySync(originPath, `${basePath}/src/api/${api}`);
          }
          {
            const originPath = `./src/client/services/${api}`;
            logger.info(`Build`, originPath);
            fs.copySync(originPath, `${basePath}/src/client/services/${api}`);
          }
        }

      if (ws && ws !== 'core' && ws !== 'default') {
        fs.copySync(`./src/ws/${ws}`, `${basePath}/src/ws/${ws}`);
      }
    }
  }
}

{
  for (const client of Object.keys(DefaultConf.client)) {
    const capName = getCapVariableName(client);
    for (const component of Object.keys(DefaultConf.client[client].components)) {
      const originPath = `./src/client/components/${component}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/components/${component}`);
      }
    }
    {
      const originPath = `./src/client/${capName}.index.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/${capName}.index.js`);
      }
    }
    {
      const originPath = `./src/client/public/${client}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/public/${client}`);
      }
    }
  }
}

{
  for (const client of Object.keys(DefaultConf.ssr)) {
    const ssrPaths = getPathsSSR(DefaultConf.ssr[client]);
    for (const originPath of ssrPaths) {
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/${originPath}`);
      }
    }
  }

  fs.copyFileSync(`./conf.${confName}.js`, `${basePath}/conf.js`);
  fs.copyFileSync(
    `./.github/workflows/engine.${confName.split('dd-')[1]}.ci.yml`,
    `${basePath}/.github/workflows/engine.${confName.split('dd-')[1]}.ci.yml`,
  );

  const packageJson = JSON.parse(fs.readFileSync(`${basePath}/package.json`, 'utf8'));
  packageJson.name = repoName;
  fs.writeFileSync(
    `${basePath}/package.json`,
    JSON.stringify(packageJson, null, 4).replaceAll('pwa-microservices-template', repoName),
    'utf8',
  );

  fs.copySync(`./src/cli`, `${basePath}/src/cli`);
  if (!fs.existsSync(`${basePath}/images`)) fs.mkdirSync(`${basePath}/images`);

  const env = process.argv.includes('development') ? 'development' : 'production';
  const deploymentsFiles = ['Dockerfile', 'proxy.yaml', 'deployment.yaml', 'secret.yaml'];
  // remove engine-private of .dockerignore for local testing

  if (process.argv.includes('engine')) {
    fs.removeSync(`${basePath}/manifests/deployment`);

    if (!fs.existsSync(`./manifests/deployment/${confName}-${env}`))
      fs.mkdirSync(`./manifests/deployment/${confName}-${env}`);

    for (const file of deploymentsFiles) {
      if (fs.existsSync(`./engine-private/conf/${confName}/build/${env}/${file}`)) {
        fs.copyFileSync(`./engine-private/conf/${confName}/build/${env}/${file}`, `${basePath}/${file}`);
        fs.copyFileSync(
          `./engine-private/conf/${confName}/build/${env}/${file}`,
          `./manifests/deployment/${confName}-${env}/${file}`,
        );
      }
    }
  } else {
    for (const file of deploymentsFiles) {
      if (fs.existsSync(`./manifests/deployment/${confName}-${env}/${file}`)) {
        fs.copyFileSync(`./manifests/deployment/${confName}-${env}/${file}`, `${basePath}/${file}`);
      }
    }
  }
}
