import fs from 'fs-extra';
import { Config, loadConf } from './conf.js';
import { loggerFactory } from './logger.js';
import { buildClient } from './client-build.js';

const logger = loggerFactory(import.meta);

const clientLiveBuild = async () => {
  if (fs.existsSync(`./tmp/client.build.json`)) {
    const deployId = process.argv[2];

    let clientId = 'default';
    let host = 'default.net';
    let path = '/';
    let baseHost = `${host}${path === '/' ? '' : path}`;
    let views = Config.default.client[clientId].views;

    if (
      deployId &&
      (fs.existsSync(`./engine-private/conf/${deployId}`) || fs.existsSync(`./engine-private/replica/${deployId}`))
    ) {
      loadConf(deployId);
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
        fs.readFileSync(
          fs.existsSync(`./engine-private/replica/${deployId}`)
            ? `./engine-private/replica/${deployId}/conf.server.json`
            : fs.existsSync(`./engine-private/conf/${deployId}/conf.server.json`)
            ? `./engine-private/conf/${deployId}/conf.server.json`
            : `./conf/conf.server.json`,
          'utf8',
        ),
      );
      host = process.argv[3];
      path = process.argv[4];
      clientId = confServer[host][path].client;
      views = confClient[clientId].views;
      baseHost = `${host}${path === '/' ? '' : path}`;
    }

    logger.info('Live build config', {
      deployId,
      host,
      path,
      clientId,
      baseHost,
      views: views.length,
    });

    const updates = JSON.parse(fs.readFileSync(`./tmp/client.build.json`, 'utf8'));
    const liveClientBuildPaths = [];
    for (let srcPath of updates) {
      srcPath = srcPath.replaceAll('/', `\\`); // linux case

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
