'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { buildRuntime } from './server/runtime.js';
import { ProcessController } from './server/process.js';
import { Config, buildApiConf } from './server/conf.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildApiConf();

await buildRuntime();

ProcessController.init(logger);
