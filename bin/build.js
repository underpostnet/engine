import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
import { shellExec } from '../src/server/process.js';
import dotenv from 'dotenv';
import { getCapVariableName } from '../src/client/components/core/CommonJs.js';
import { getPathsSSR } from '../src/server/conf.js';

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
const deployList = (confName === 'dd' ? fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8') : confName).split(
  ',',
);

logger.info('', {
  confName,
  repoName,
  basePath,
  deployList,
});

if (process.argv.includes('clean')) {
  if (fs.existsSync(`${basePath}/images`)) fs.copySync(`${basePath}/images`, `./images`);
  shellExec(`cd ${basePath} && git checkout .`);
  shellExec(`cd ${basePath} && git clean -f -d`);
  process.exit(0);
}

if (process.argv.includes('conf')) {
  for (const _confName of deployList) {
    const _repoName = `engine-${_confName.split('dd-')[1]}`;
    const privateRepoName = `${_repoName}-private`;
    const privateGitUri = `${process.env.GITHUB_USERNAME}/${privateRepoName}`;

    if (!fs.existsSync(`../${privateRepoName}`)) {
      shellExec(`cd .. && underpost clone ${privateGitUri}`, { silent: true });
    } else {
      shellExec(`cd ../${privateRepoName} && git checkout . && git clean -f -d && underpost pull . ${privateGitUri}`);
    }
    const toPath = `../${privateRepoName}/conf/${_confName}`;
    fs.removeSync(toPath);
    fs.mkdirSync(toPath, { recursive: true });
    fs.copySync(`./engine-private/conf/${_confName}`, toPath);
    if (process.argv.includes('remove-replica') && fs.existsSync(`../${privateRepoName}/replica`)) {
      fs.removeSync(`../${privateRepoName}/replica`);
    } else if (fs.existsSync(`./engine-private/replica`)) {
      const replicas = await fs.readdir(`./engine-private/replica`);
      for (const replica of replicas)
        if (replica.match(_confName))
          fs.copySync(`./engine-private/replica/${replica}`, `../${privateRepoName}/replica/${replica}`);
    }
    if (fs.existsSync(`./engine-private/itc-scripts`)) {
      const itcScripts = await fs.readdir(`./engine-private/itc-scripts`);
      for (const itcScript of itcScripts)
        if (itcScript.match(_confName))
          fs.copySync(`./engine-private/itc-scripts/${itcScript}`, `../${privateRepoName}/itc-scripts/${itcScript}`);
    }
    shellExec(
      `cd ../${privateRepoName}` +
        ` && git add .` +
        ` && underpost cmt . ci engine-core-conf 'Update ${_confName} conf'` +
        ` && underpost push . ${privateGitUri}`,
    );
  }
  process.exit(0);
}

if (confName === 'dd') {
  for (const _confName of deployList) {
    shellExec(`node bin/build ${_confName}`);
  }
  process.exit(0);
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

  shellExec(`node bin/deploy update-default-conf ${confName}`);

  fs.copyFileSync(`./conf.${confName}.js`, `${basePath}/conf.js`);

  switch (confName) {
    case 'dd-cyberia':
      fs.copyFileSync(`./bin/cyberia.js`, `${basePath}/bin/cyberia.js`);
      fs.copyFileSync(`./bin/cyberia.js`, `${basePath}/bin/cyberia0.js`);
      break;

    default:
      break;
  }

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
  const deploymentsFiles = ['proxy.yaml', 'deployment.yaml', 'secret.yaml'];
  // remove engine-private of .dockerignore for local testing
  for (const file of deploymentsFiles) {
    if (fs.existsSync(`./manifests/deployment/${confName}-${env}/${file}`)) {
      fs.copyFileSync(`./manifests/deployment/${confName}-${env}/${file}`, `${basePath}/${file}`);
    }
  }

  if (!fs.existsSync(`${basePath}/.github/workflows`))
    fs.mkdirSync(`${basePath}/.github/workflows`, {
      recursive: true,
    });

  fs.copyFileSync(`./.github/workflows/${repoName}.ci.yml`, `${basePath}/.github/workflows/${repoName}.ci.yml`);
  fs.copyFileSync(`./.github/workflows/${repoName}.cd.yml`, `${basePath}/.github/workflows/${repoName}.cd.yml`);

  if (fs.existsSync(`./src/ws/${confName.split('-')[1]}`)) {
    fs.copySync(`./src/ws/${confName.split('-')[1]}`, `${basePath}/src/ws/${confName.split('-')[1]}`);
  }
}
