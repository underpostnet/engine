import fs from 'fs-extra';
import { srcFormatted } from './client-formatted.js';
import { Config } from './conf.js';
import { loggerFactory } from './logger.js';
import { buildClient } from './client-build.js';

const logger = loggerFactory(import.meta);

const clientLiveBuild = async () => {
  if (fs.existsSync(`./tmp/client.build.json`)) {
    const clientId = 'default';
    const host = 'default.net';
    const path = '/';
    const baseHost = `${host}${path === '/' ? '' : path}`;
    const updates = JSON.parse(fs.readFileSync(`./tmp/client.build.json`, 'utf8'));
    const liveClientBuildPaths = [];
    for (let srcPath of updates) {
      const srcBuildPath = `./src${srcPath.split('src')[1].replace(/\\/g, '/')}`;
      if (
        srcPath.split('src')[1].startsWith(`\\client\\components`) ||
        srcPath.split('src')[1].startsWith(`\\client\\services`)
      ) {
        const publicBuildPath = `./public/${baseHost}/${srcPath.split('src')[1].slice(8)}`.replace(/\\/g, '/');
        liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
      } else if (srcPath.split('src')[1].startsWith(`\\client\\sw`)) {
        const publicBuildPath = `./public/${baseHost}/sw.js`;
        liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
      } else if (srcPath.split('src')[1].startsWith(`\\client`) && srcPath.slice(-9) === '.index.js') {
        for (const view of Config.default.client[clientId].views) {
          const publicBuildPath = `./public/${baseHost}${view.path === '/' ? '' : view.path}/${clientId}.index.js`;
          liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
        }
      } else if (srcPath.split('src')[1].startsWith(`\\client\\ssr`)) {
        for (const view of Config.default.client[clientId].views) {
          const publicBuildPath = `./public/${baseHost}${view.path === '/' ? '' : view.path}/index.html`;
          liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
        }
      }
    }
    logger.info('liveClientBuildPaths', liveClientBuildPaths);
    await buildClient({ liveClientBuildPaths });
    fs.removeSync(`./tmp/client.build.json`);
  }
};

export { clientLiveBuild };
