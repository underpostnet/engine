#! /usr/bin/env node

import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import { Command } from 'commander';
import { actionInitLog, loggerFactory } from '../src/server/logger.js';
import Underpost from '../src/index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const program = new Command();

program.name('underpost').description(`underpost.net ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new <app-name>')
  .description('Create a new project')
  .action((...args) => ((args[1] = Underpost.version), new Underpost.project(...args)));

program
  .command('clone <uri>')
  .description('Clone github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.project.clone);

program
  .command('pull <path> <uri>')
  .description('Pull github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.project.pull);

program
  .option('--copy')
  .option('--info')
  .option('--empty')
  .command('cmt <path> [commit-type] [sub-module] [message]')
  .description(
    'Commit github repository, if your GITHUB_TOKEN environment exists, it will be used, use --copy will copy to clipboard message, use --info will see info commit types, use --empty will allow empty files',
  )
  .action((...args) => ((args[4] = options), Underpost.project.commit(...args)));

program
  .command('push <path> <uri>')
  .description('Push github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.project.push);

program
  .command('env <deploy-id> [env]')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(Underpost.project.useEnv);

program.command('test').description('Run tests').action(Underpost.runTest);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    program.outputHelp();
  });

const options = program.opts();

program.parse();
