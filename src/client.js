'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';
import { shellExec } from './server/process.js';
import nodemon from 'nodemon';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

shellExec(`env-cmd -f .env.development node src/api`, { async: true });

// States
// start - child process has started
// crash - child process has crashed (nodemon will not emit exit)
// exit - child process has cleanly exited (ie. no crash)
// restart([ array of files triggering the restart ]) - child process has restarted
// config:update - nodemon's config has changed

nodemon({ script: 'src/client.build', args: ['l'] })
  .on('start', function (...args) {
    logger.info(args, 'nodemon started');
  })
  .on('restart', function (...args) {
    logger.info(args, 'nodemon restart');
  })
  .on('crash', function (error) {
    logger.error(error, 'script crashed for some reason');
  });

ProcessController.init(logger);
