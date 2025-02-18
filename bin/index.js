#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import { loggerFactory } from '../src/server/logger.js';
import Underpost from '../src/index.js';
import {
  getNpmRootPath,
  loadConf,
  newProject,
  repoClone,
  repoCommit,
  repoPull,
  repoPush,
  UnderpostRootEnv,
} from '../src/server/conf.js';
import fs from 'fs-extra';

const npmRoot = getNpmRootPath();
const underpostRoot = `${npmRoot}/underpost/.env`;
fs.existsSync(underpostRoot) ? dotenv.config({ path: underpostRoot, override: true }) : dotenv.config();

const logger = loggerFactory(import.meta);

const program = new Command();

program.name('underpost').description(`underpost.net ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new <app-name>')
  .description('Create a new project')
  .action((...args) => ((args[1] = Underpost.version), newProject(...args)));

program
  .command('clone <uri>')
  .description('Clone github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(repoClone);

program
  .command('pull <path> <uri>')
  .description('Pull github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(repoPull);

program
  .option('--copy')
  .option('--info')
  .option('--empty')
  .command('cmt <path> [commit-type] [sub-module] [message]')
  .description(
    'Commit github repository, if your GITHUB_TOKEN environment exists, it will be used, use --copy will copy to clipboard message, use --info will see info commit types, use --empty will allow empty files',
  )
  .action((...args) => ((args[4] = options), repoCommit(...args)));

program
  .command('push <path> <uri>')
  .description('Push github repository, if your GITHUB_TOKEN environment exists, it will be used')
  .action(repoPush);

program
  .command('env <deploy-id> [env]')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(loadConf);

program
  .command('config <operator> [key] [value]')
  .description(`Manage configuration, operators available: ${Object.keys(UnderpostRootEnv)}`)
  .action((...args) => UnderpostRootEnv[args[0]](args[1], args[2]));

program
  .command('root')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(getNpmRootPath);

program.command('test').description('Run tests').action(Underpost.runTest);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    program.outputHelp();
  });

const options = program.opts();

program.parse();
