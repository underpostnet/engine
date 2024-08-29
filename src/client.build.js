'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { Config } from './server/conf.js';
import { clientLiveBuild } from './server/client-dev-server.js';
import { ProcessController } from './server/process.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await clientLiveBuild();

ProcessController.init(logger);
