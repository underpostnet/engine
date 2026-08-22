'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { buildClient } from './server/client-build.js';
import { buildRuntime } from './server/runtime.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildRuntime();

ProcessController.init(logger);
