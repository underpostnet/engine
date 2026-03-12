'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import { loadEnv } from './server/env.js';
import { loggerFactory } from './server/logger.js';
import { ProcessController } from './server/process.js';
import { Config, buildClientStaticConf } from './server/conf.js';
import { createClientDevServer } from './server/client-dev-server.js';

loadEnv();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildClientStaticConf({ devProxy: process.argv[6] === 'proxy' });

await Config.build();

await createClientDevServer();

ProcessController.init(logger);
