#! /usr/bin/env node

import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { Command } from 'commander';

dotenv.config();

const globalBinFolder = `${shellExec(`npm root -g`, {
  stdout: true,
  silent: true,
  disableLog: true,
}).trim()}/underpost`;

const program = new Command();

const version = '2.7.0';

program.name('underpost').description(`underpost.net ci/cd cli ${version}`).version(version);

program
  .command('new <app-name>')
  .description('Create a new project')
  .action((appName) => {
    const destFolder = `${process.cwd()}/${appName}`;
    console.log('Note: This process may take several minutes to complete');
    console.log('build app', { destFolder });
    fs.mkdirSync(destFolder, { recursive: true });
    fs.copySync(globalBinFolder, destFolder);
    fs.writeFileSync(`${destFolder}/.gitignore`, fs.readFileSync(`${globalBinFolder}/.dockerignore`, 'utf8'), 'utf8');
    shellCd(`${destFolder}`);
    shellExec(`git init && git add . && git commit -m "Base template implementation"`);
    shellExec(`npm run install-template`);
    shellExec(`npm run dev`);
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
