#! /usr/bin/env node

import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { Command } from 'commander';
import { MongooseDB } from '../src/db/mongo/MongooseDB.js';
import { actionInitLog, loggerFactory } from '../src/server/logger.js';
import Underpost from '../src/index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const globalBinFolder = `${shellExec(`npm root -g`, {
  stdout: true,
  silent: true,
  disableLog: true,
}).trim()}/underpost`;

const program = new Command();

program.name('underpost').description(`underpost.net ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new <app-name>')
  .description('Create a new project')
  .action(async (appName) => {
    actionInitLog(Underpost.version);
    await logger.setUpInfo();
    const destFolder = `${process.cwd()}/${appName}`;
    logger.info('Note: This process may take several minutes to complete');
    logger.info('build app', { destFolder });
    fs.mkdirSync(destFolder, { recursive: true });
    fs.copySync(globalBinFolder, destFolder);
    fs.writeFileSync(`${destFolder}/.gitignore`, fs.readFileSync(`${globalBinFolder}/.dockerignore`, 'utf8'), 'utf8');
    shellCd(`${destFolder}`);
    shellExec(`git init && git add . && git commit -m "Base template implementation"`);
    shellExec(`npm install`);
    shellExec(`npm run build`);
    shellExec(`npm run dev`);
  });

program
  .command('clone <uri>')
  .description('Clone github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.project.clone);

program
  .command('env <deploy-id> [env]')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(Underpost.project.useEnv);

program
  .command('test')
  .description('Run tests')
  .action(() => {
    actionInitLog(Underpost.version);
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
