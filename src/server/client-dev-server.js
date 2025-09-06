import fs from 'fs-extra';
import nodemon from 'nodemon';
import { shellExec } from './process.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

const createClientDevServer = () => {
  // process.argv.slice(2).join(' ')
  shellExec(`env-cmd -f .env.development node bin/deploy build-full-client ${process.argv.slice(2).join(' ')}`);
  shellExec(
    `env-cmd -f .env.development node src/api ${process.argv[2]}${process.argv[5] ? ` ${process.argv[5]}` : ''}${
      process.argv.includes('static') ? ' static' : ''
    }`,
    { async: true },
  );

  // https://github.com/remy/nodemon/blob/main/doc/events.md

  // States
  // start - child process has started
  // crash - child process has crashed (nodemon will not emit exit)
  // exit - child process has cleanly exited (ie. no crash)
  // restart([ array of files triggering the restart ]) - child process has restarted
  // config:update - nodemon's config has changed

  if (fs.existsSync(`./tmp/client.build.json`)) fs.removeSync(`./tmp/client.build.json`);

  let buildPathScope = [];

  const nodemonOptions = { script: './src/client.build', args: process.argv.slice(2), watch: 'src/client' };
  logger.info('nodemon option', { nodemonOptions });
  nodemon(nodemonOptions)
    .on('start', function (...args) {
      logger.info(args, 'nodemon started');
    })
    .on('restart', function (...args) {
      logger.info(args, 'nodemon restart');
      const eventPath = args[0][0];
      const indexPath = buildPathScope.findIndex((buildObjScope) => buildObjScope.path === eventPath);
      const buildObj = {
        timestamp: new Date().getTime(),
        path: eventPath,
      };
      if (indexPath > -1) {
        buildPathScope[indexPath].timestamp = buildObj.timestamp;
      } else buildPathScope.push(buildObj);
      setTimeout(() => {
        buildPathScope = buildPathScope.filter((buildObjScope) => buildObjScope.timestamp !== buildObj.timestamp);
      }, 2500);
      const buildPathScopeBuild = buildPathScope.map((o) => o.path);
      logger.info('buildPathScopeBuild', buildPathScopeBuild);
      fs.writeFileSync(`./tmp/client.build.json`, JSON.stringify(buildPathScopeBuild, null, 4));
    })
    .on('crash', function (error) {
      logger.error(error, error.message);
    });
};

export { createClientDevServer };
