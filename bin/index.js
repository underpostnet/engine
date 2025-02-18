#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import { loggerFactory } from '../src/server/logger.js';
import Underpost from '../src/index.js';
import { getNpmRootPath, loadConf } from '../src/server/conf.js';
import fs from 'fs-extra';

const npmRoot = getNpmRootPath();
const underpostRoot = `${npmRoot}/underpost/.env`;
fs.existsSync(underpostRoot) ? dotenv.config({ path: underpostRoot, override: true }) : dotenv.config();

const logger = loggerFactory(import.meta);

const program = new Command();

program.name('underpost').description(`underpost ci/cd cli ${Underpost.version}`).version(Underpost.version);

program.command('new <app-name>').description('Create a new project').action(Underpost.repo.new);

program
  .command('clone <uri>')
  .description('Clone github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.repo.clone);

program
  .command('pull <path> <uri>')
  .description('Pull github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.repo.pull);

program
  .option('--copy')
  .option('--info')
  .option('--empty')
  .command('cmt <path> [commit-type] [sub-module] [message]')
  .description(
    'Commit github repository, if your GITHUB_TOKEN environment exists, it will be used, use --copy will copy to clipboard message, use --info will see info commit types, use --empty will allow empty files',
  )
  .action((...args) => ((args[4] = options), Underpost.repo.commit(...args)));

program
  .command('push <path> <uri>')
  .description('Push github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(Underpost.repo.push);

program
  .command('env <deploy-id> [env]')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(loadConf);

program
  .command('config <operator> [key] [value]')
  .description(`Manage configuration, operators available: set,delete,get,list,clean`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2]));

program
  .command('root')
  .description('Get npm root path')
  .action(() => console.log(getNpmRootPath()));

program.command('test').description('Run tests').action(Underpost.test.run);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    program.outputHelp();
  });

const options = program.opts();

program.parse();
