#! /usr/bin/env node

import { loggerFactory } from '../src/server/logger.js';
import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { Command } from 'commander';

dotenv.config();

// const logger = loggerFactory(import.meta);
// await logger.setUpInfo();

const globalBinFolder = `${shellExec(`npm root -g`, {
  stdout: true,
  silent: true,
  disableLog: true,
}).trim()}/underpost`;

const program = new Command();

program.name('underpost').description('underpost.net ci/cd cli').version('2.6.3');

program
  .command('new <app-name>')
  .description('Create a new project')
  .action((appName) => {
    const destFolder = `${process.cwd()}/${appName}`;
    fs.mkdirSync(destFolder, { recursive: true });
    fs.copySync(globalBinFolder, destFolder);
  });

program
  .command('test')
  .description('Run tests')
  .action(() => {
    shellCd(`${globalBinFolder}`);
    shellExec(`npm run test`);
  });

program
  .command('help')
  .description('Display help information')
  .action(() => {
    program.outputHelp();
  });

program.parse();
