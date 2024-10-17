#! /usr/bin/env node

import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { Command } from 'commander';
import { MongooseDB } from '../src/db/mongo/MongooseDB.js';
import { loggerFactory, underpostASCI } from '../src/server/logger.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const globalBinFolder = `${shellExec(`npm root -g`, {
  stdout: true,
  silent: true,
  disableLog: true,
}).trim()}/underpost`;

const program = new Command();

const version = '2.7.6';

program.name('underpost').description(`underpost.net ci/cd cli ${version}`).version(version);

program
  .command('new <app-name>')
  .description('Create a new project')
  .action(async (appName) => {
    console.log(
      underpostASCI() +
        `
    v${version} https://www.nexodev.org/docs
    `,
    );
    await logger.setUpInfo();
    const destFolder = `${process.cwd()}/${appName}`;
    logger.info('Note: This process may take several minutes to complete');
    logger.info('build app', { destFolder });
    fs.mkdirSync(destFolder, { recursive: true });
    fs.copySync(globalBinFolder, destFolder);
    fs.writeFileSync(`${destFolder}/.gitignore`, fs.readFileSync(`${globalBinFolder}/.dockerignore`, 'utf8'), 'utf8');
    shellCd(`${destFolder}`);
    shellExec(`git init && git add . && git commit -m "Base template implementation"`);
    shellExec(`npm run install-template`);
    switch (process.platform) {
      case 'linux':
        try {
          await MongooseDB.server();
        } catch (error) {
          logger.error(error, 'failed to start mongodb server');
        }
        break;

      default:
        break;
    }
    shellExec(`npm run dev`);
  });

program
  .command('test')
  .description('Run tests')
  .action(() => {
    console.log(
      underpostASCI() +
        `
    v${version} https://www.nexodev.org/docs
    `,
    );
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
