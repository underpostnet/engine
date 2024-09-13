#!node ./bin

import { spawn } from 'node:child_process';
import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

switch (process.argv[3]) {
  case 'run-dev':
    // underpost run-dev
    shellCd(`./node_modules/underpost-pwa-api-rest-template`);
    shellExec(`npm run dev`);
    break;

  default:
    break;
}
