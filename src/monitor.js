'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { ProcessController } from './server/process.js';
import { getUnderpostRootPath } from './server/conf.js';
import fs from 'fs-extra';
import UnderpostMonitor from './cli/monitor.js';

const underpostRootPath = getUnderpostRootPath();
fs.existsSync(`${underpostRootPath}/.env`)
  ? dotenv.config({ path: `${underpostRootPath}/.env`, override: true })
  : dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

const deployId = process.argv[2];
const env = process.argv[3] || 'production';
const replicas = process.argv[4] || '1';
const namespace = process.argv[5] || 'default';

UnderpostMonitor.API.callback(deployId, env, {
  type: 'blue-green',
  sync: true,
  replicas,
  namespace,
});

ProcessController.init(logger);
