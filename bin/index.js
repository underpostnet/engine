#! /usr/bin/env node

import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import fs from 'fs-extra';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

switch (process.argv[2]) {
  case 'new':
    {
      const projectName = process.argv[3] || 'my-project';
      const globalBinFolder = shellExec(`npm root -g`, { stdout: true, silent: true }).trim();
      const destFolder = `${process.cwd()}/${projectName}`;
      fs.mkdirSync(destFolder, { recursive: true });
      fs.copySync(`${globalBinFolder}/underpost`, destFolder);
      shellCd(`${destFolder}`);
      shellExec(`npm run install-template`);
      shellExec(`npm run dev`);
    }
    break;
  default:
    break;
}
