import fs from 'fs-extra';
import nodemon from 'nodemon';
import { shellExec } from './process.js';
import { loggerFactory } from './logger.js';
import { srcFormatted } from './client-formatted.js';
import { Config } from './conf.js';

const logger = loggerFactory(import.meta);

const createClientDevServer = () => {
  shellExec(`env-cmd -f .env.development node src/api`, { async: true });

  // https://github.com/remy/nodemon/blob/main/doc/events.md

  // States
  // start - child process has started
  // crash - child process has crashed (nodemon will not emit exit)
  // exit - child process has cleanly exited (ie. no crash)
  // restart([ array of files triggering the restart ]) - child process has restarted
  // config:update - nodemon's config has changed

  if (fs.existsSync(`./tmp/client.build.json`)) fs.removeSync(`./tmp/client.build.json`);

  let buildPathScope = [];

  nodemon({ script: './src/client.build' /* args: ['l'] */, watch: 'src/client' })
    .on('start', function (...args) {
      logger.info(args, 'nodemon started');
    })
    .on('restart', function (...args) {
      logger.info(args, 'nodemon restart');
      const buildObj = {
        timestamp: new Date().getTime(),
        path: args[0][0],
      };
      buildPathScope.push(buildObj);
      setTimeout(() => {
        buildPathScope = buildPathScope.filter((buildObjScope) => buildObjScope.timestamp !== buildObj.timestamp);
      }, 2500);
      const buildPathScopeBuild = buildPathScope.map((o) => o.path);
      logger.info('buildPathScopeBuild', buildPathScopeBuild);
      fs.writeFileSync(`./tmp/client.build.json`, JSON.stringify(buildPathScopeBuild, null, 4));
    })
    .on('crash', function (error) {
      logger.error(error, 'script crashed for some reason');
    });
};

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

export { createClientDevServer, clientLiveBuild };
