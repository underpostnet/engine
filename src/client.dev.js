'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';
import { createClientDevServer } from './server/client-dev-server.js';
dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await createClientDevServer();

ProcessController.init(logger);
