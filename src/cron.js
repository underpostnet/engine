'use strict';

// https://nodejs.org/api
// https://expressjs.com/en/4x/api.html

import dotenv from 'dotenv';
import { loggerFactory } from './server/logger.js';
import { Dns } from './server/dns.js';
import { ProcessController } from './server/process.js';
import { Config } from './server/conf.js';
import { BackUpManagement } from './server/backup.js';

dotenv.config();

await Config.build();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

await Dns.InitIpDaemon();

await BackUpManagement.Init();

ProcessController.init(logger);
