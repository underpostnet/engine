'use strict';

import dotenv from 'dotenv';
import { loggerFactory } from './server/ops/logger.js';
import { buildRuntime } from './server/runtime/runtime.js';
import { ProcessController } from './server/runtime/process.js';
import { Config, buildApiConf } from './server/runtime/conf.js';

dotenv.config();

await Config.build(undefined, undefined, await buildApiConf());

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildRuntime();

ProcessController.init(logger);
