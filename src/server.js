'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import v8 from 'v8';
import dotenv from 'dotenv';
import isAdmin from 'is-admin';

import { loggerFactory } from './server/logger.js';
import { buildClient } from './server/client-build.js';
import { buildRuntime } from './server/runtime.js';
import { buildProxy } from './server/proxy.js';
import { Dns } from './server/dns.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';
import { formatBytes } from './client/components/core/CommonJs.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);
logger.info('env', process.env.NODE_ENV);
logger.info('admin', await isAdmin());
logger.info('--max-old-space-size', {
  total_available_size: formatBytes(v8.getHeapStatistics().total_available_size),
});

await buildClient();
await buildRuntime();

// await buildProxy();
// await Dns.InitIpDaemon();
// ProcessController.init();
