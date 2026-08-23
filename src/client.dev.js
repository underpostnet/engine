'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import { loggerFactory } from './server/ops/logger.js';
import { ProcessController } from './server/runtime/process.js';
import { Config, buildClientStaticConf } from './server/runtime/conf.js';
import { createClientDevServer } from './client-builder/client-dev-server.js';

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildClientStaticConf({ devProxy: process.argv[6] === 'proxy' });

await Config.build();

await createClientDevServer();

ProcessController.init(logger);
