#!node ./bin

import { spawn } from 'node:child_process';
import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

shellCd(`./node_modules/underpost`);

switch (process.argv[3]) {
  case 'build':
    shellExec(`npm run build`);
    break;
  case 'run-dev':
    shellExec(`npm run dev`);
    break;

  default:
    break;
}
