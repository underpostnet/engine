import fs from 'fs-extra';
import { getCapVariableName } from '../src/server/conf.js';
import { loggerFactory } from '../src/server/logger.js';
import { shellCd, shellExec } from '../src/server/process.js';
import dotenv from 'dotenv';

const baseConfPath = './engine-private/conf/dd-cron/.env.production';
if (fs.existsSync(baseConfPath)) dotenv.config({ path: baseConfPath });

const logger = loggerFactory(import.meta);

// (async () => {
//   return;
//   const files = await fs.readdir(`./src`);
//   for (const relativePath of files) {
//   }
// })();

const confName = process.argv[2];
const basePath = '../pwa-microservices-template';
const repoName = `engine-${confName.split('dd-')[1]}-private`;
const gitUrl = `https://${process.env.GITHUB_TOKEN}@github.com/underpostnet/${repoName}.git`;

logger.info('', {
  confName,
  // gitUrl,
  repoName,
  basePath,
});

if (process.argv.includes('info')) process.exit(0);

if (process.argv.includes('conf')) {
  if (!fs.existsSync(`../${repoName}`)) {
    shellExec(`cd .. && git clone ${gitUrl}`, { silent: true });
  } else {
    shellExec(`cd ../${repoName} && git pull`);
  }
  const toPath = `../${repoName}/conf/${confName}`;
  fs.removeSync(toPath);
  fs.mkdirSync(toPath, { recursive: true });
  fs.copySync(`./engine-private/conf/${confName}`, toPath);
  shellExec(
    `cd ../${repoName}` +
      ` && git add .` +
      ` && git commit -m "ci(engine-core-conf): ⚙️ Update ${confName} conf"` +
      ` && git push`,
  );
  process.exit(0);
}

if (process.argv.includes('test')) {
  fs.mkdirSync(`${basePath}/engine-private/conf`, { recursive: true });
  fs.copySync(`./engine-private/conf/${confName}`, `${basePath}/engine-private/conf/${confName}`);
}

const BuilderConf = {
  'dd-core': {
    apis: [
      'blockchain',
      'bot',
      'core',
      'cron',
      'crypto',
      'default',
      'document',
      'event',
      'event-scheduler',
      'file',
      'healthcare-appointment',
      'instance',
      'ipfs',
      'notification',
      'test',
      'user',
      'user-group',
    ],
    clients: [
      'bymyelectrics',
      'chart',
      'cryptokoyn',
      'dogmadual',
      'healthcare',
      'itemledger',
      'nexodev',
      'underpost',
      'chart',
    ],
  },
};
(() => {
  for (const api of BuilderConf[confName].apis) {
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
})();
(async () => {
  for (const client of BuilderConf[confName].clients) {
    const capName = getCapVariableName(client);
    {
      const originPath = `./src/client/${capName}.index.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/${capName}.index.js`);
      }
    }
    {
      const originPath = `./src/client/components/${client}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/components/${client}`);
      }
    }
    {
      const originPath = `./src/client/public/${client}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/public/${client}`);
      }
    }
    {
      const originPath = `./src/client/ssr/body/${capName}SplashScreen.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/ssr/body/${capName}SplashScreen.js`);
      }
    }
    {
      const originPath = `./src/client/ssr/body/${capName}DefaultSplashScreen.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/ssr/body/${capName}DefaultSplashScreen.js`);
      }
    }
    {
      const originPath = `./src/client/ssr/head/Pwa${capName}.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/ssr/head/Pwa${capName}.js`);
      }
    }
    {
      const originPath = `./src/client/ssr/head/${capName}Scripts.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/ssr/head/${capName}Scripts.js`);
      }
    }
  }

  for (const file of ['pod.yaml', 'startup.js', 'Dockerfile']) {
    const originPath = `./engine-private/conf/${confName}/build/${
      process.argv.includes('development') ? 'development' : 'production'
    }/${file}`;
    if (fs.existsSync(originPath)) {
      logger.info(`Build`, originPath);
      fs.copyFileSync(originPath, `${basePath}/${file}`);
    }
  }
})();
