/**
 * Module for live building client-side code
 * @module src/server/client-build-live.js
 * @namespace clientLiveBuild
 */

import fs from 'fs-extra';
import { Config, loadConf } from './conf.js';
import { loggerFactory } from './logger.js';
import { buildClient } from './client-build.js';

const logger = loggerFactory(import.meta);

/**
 * @function clientLiveBuild
 * @description Initiates a live build of client-side code.
 * @memberof clientLiveBuild
 */
const clientLiveBuild = async () => {
  if (fs.existsSync(`./tmp/client.build.json`)) {
    const deployId = process.argv[2];
    const subConf = process.argv[3];
    let clientId = 'default';
    let host = 'default.net';
    let path = '/';
    let baseHost = `${host}${path === '/' ? '' : path}`;
    let views = Config.default.client[clientId].views;
    let apiBaseHost;
    let apiBaseProxyPath;

    if (
      deployId &&
      (fs.existsSync(`./engine-private/conf/${deployId}`) || fs.existsSync(`./engine-private/replica/${deployId}`))
    ) {
      loadConf(deployId, subConf);
      const confClient = JSON.parse(
        fs.readFileSync(
          fs.existsSync(`./engine-private/replica/${deployId}`)
            ? `./engine-private/replica/${deployId}/conf.client.json`
            : fs.existsSync(`./engine-private/conf/${deployId}/conf.client.json`)
            ? `./engine-private/conf/${deployId}/conf.client.json`
            : `./conf/conf.client.json`,
          'utf8',
        ),
      );
      const confServer = JSON.parse(
        fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`, 'utf8'),
      );
      host = process.argv[4];
      path = process.argv[5];
      clientId = confServer[host][path].client;
      views = confClient[clientId].views;
      baseHost = `${host}${path === '/' ? '' : path}`;
      apiBaseHost = confServer[host][path].apiBaseHost;
      apiBaseProxyPath = confServer[host][path].apiBaseProxyPath;
    }

    logger.info('Live build config', {
      deployId,
      subConf,
      host,
      path,
      clientId,
      baseHost,
      views: views.length,
      apiBaseHost,
      apiBaseProxyPath,
    });

    const updates = JSON.parse(fs.readFileSync(`./tmp/client.build.json`, 'utf8'));
    const liveClientBuildPaths = [];
    for (let srcPath of updates) {
      srcPath = srcPath.replaceAll('/', `\\`);

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
      } else if (
        srcPath.split('src')[1].startsWith(`\\client\\offline`) &&
        srcPath.split('src')[1].startsWith(`index.js`)
      ) {
        const publicBuildPath = `./public/${baseHost}/offline.js`;
        liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
      } else if (srcPath.split('src')[1].startsWith(`\\client`) && srcPath.slice(-9) === '.index.js') {
        for (const view of views) {
          const publicBuildPath = `./public/${baseHost}${view.path === '/' ? '' : view.path}/${clientId}.index.js`;
          liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
        }
      } else if (srcPath.split('src')[1].startsWith(`\\client\\ssr`)) {
        for (const view of views) {
          const publicBuildPath = `./public/${baseHost}${view.path === '/' ? '' : view.path}/index.html`;
          liveClientBuildPaths.push({ srcBuildPath, publicBuildPath });
        }
      }
    }
    logger.info('liveClientBuildPaths', liveClientBuildPaths);
    await buildClient({ liveClientBuildPaths, instances: [{ host, path }] });
    fs.removeSync(`./tmp/client.build.json`);
  }
};

export { clientLiveBuild };
