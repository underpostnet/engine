'use strict';

import { loggerFactory } from './server/ops/logger.js';
import { Config } from './server/runtime/conf.js';
import { ProcessController } from './server/runtime/process.js';
import { clientLiveBuild } from './client-builder/client-build-live.js';

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await clientLiveBuild();
