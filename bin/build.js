import fs from 'fs-extra';
import { getCapVariableName } from '../src/server/conf.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

// (async () => {
//   return;
//   const files = await fs.readdir(`./src`);
//   for (const relativePath of files) {
//   }
// })();

switch (process.argv[2]) {
  case 'dd-core':
    {
      const basePath = '../pwa-microservices-template';
      if (process.argv.includes('private')) {
        fs.mkdirSync(`${basePath}/engine-private/conf`, { recursive: true });
        fs.copySync(`./engine-private/conf/dd-core`, `${basePath}/engine-private/conf/dd-core`);
      }

      (() => {
        const apis = [
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
        ];
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
      })();
      (async () => {
        const clients = [
          'bymyelectrics',
          'chart',
          'cryptokoyn',
          'dogmadual',
          'healthcare',
          'itemledger',
          'nexodev',
          'underpost',
          'chart',
        ];
        for (const client of clients) {
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
      })();
    }
    break;
  default:
    break;
}
