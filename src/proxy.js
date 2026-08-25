'use strict';

import { loggerFactory } from './server/ops/logger.js';
import { buildProxy } from './server/network/proxy.js';
import { ProcessController } from './server/runtime/process.js';
import { Config } from './server/runtime/conf.js';

await Config.build(process.argv[2], process.argv[3], process.argv[4]);

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await buildProxy();

ProcessController.init(logger);
