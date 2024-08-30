import fs from 'fs-extra';
import { srcFormatted } from './client-formatted.js';
import { Config } from './conf.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

const clientLiveBuild = async () => {
  if (fs.existsSync(`./tmp/client.build.json`)) {
    const updates = JSON.parse(fs.readFileSync(`./tmp/client.build.json`, 'utf8'));
    // logger.info('updates', updates);
    for (let srcPath of updates) {
      if (
        srcPath.split('src')[1].startsWith(`\\client\\components`) ||
        srcPath.split('src')[1].startsWith(`\\client\\services`)
      ) {
        const buildPath = `./public/default.net/${srcPath.split('src')[1].slice(8)}`.replace(/\\/g, '/');
        srcPath = srcPath.replace(/\\/g, '/');
        logger.info('update component', {
          srcPath,
          buildPath,
        });
        fs.writeFileSync(buildPath, await srcFormatted(fs.readFileSync(srcPath, 'utf8')), 'utf8');
      } else if (srcPath.split('src')[1].startsWith(`\\client\\sw`)) {
        const buildPath = `./public/default.net/sw.js`;
        srcPath = srcPath.replace(/\\/g, '/');
        logger.info('update service worker', {
          srcPath,
          buildPath,
        });
        fs.writeFileSync(buildPath, await srcFormatted(fs.readFileSync(srcPath, 'utf8')), 'utf8');
      } else if (srcPath.split('src')[1].startsWith(`\\client`) && srcPath.slice(-9) === '.index.js') {
        const clientId = 'default';
        for (const view of Config.default.client[clientId].views) {
          const buildPath = `./public/default.net${view.path === '/' ? '' : view.path}/${clientId}.index.js`;
          const srcViewPath = srcPath.replace(/\\/g, '/');
          logger.info('update view component', {
            srcViewPath,
            buildPath,
          });
          fs.writeFileSync(buildPath, await srcFormatted(fs.readFileSync(srcPath, 'utf8')), 'utf8');
        }
      }
    }
    fs.removeSync(`./tmp/client.build.json`);
  }
};

export { clientLiveBuild };
