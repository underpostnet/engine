'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import { loggerFactory } from './server/logger.js';
import { Config } from './server/conf.js';
import { ProcessController } from './server/process.js';
import { clientLiveBuild } from './client-builder/client-build-live.js';

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await clientLiveBuild();
