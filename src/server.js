'use strict';

import dotenv from 'dotenv';
import { loggerFactory } from './server/ops/logger.js';
import { buildClient } from './client-builder/client-build.js';
import { buildRuntime } from './server/runtime/runtime.js';
import { ProcessController } from './server/runtime/process.js';
import { Config } from './server/runtime/conf.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

if (process.env.NODE_ENV === 'development') await buildClient();

await buildRuntime();

ProcessController.init(logger);
