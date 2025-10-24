'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { buildProxy } from './server/proxy.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';

dotenv.config();

await Config.build(process.argv[2], process.argv[3], process.argv[4]);

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildProxy();

ProcessController.init(logger);
