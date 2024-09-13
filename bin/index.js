#!node ./bin

import { spawn } from 'node:child_process';
import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();
