#!node ./node_modules/underpost/bin

import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';
import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

switch (process.argv[3]) {
  case 'new-project':
    fs.copySync(`./node_modules/underpost`, `./`);
    shellExec(`npm run build`);
    shellExec(`npm run dev`);
    break;
  default:
    break;
}
