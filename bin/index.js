#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import { loggerFactory } from '../src/server/logger.js';
import Underpost from '../src/index.js';
import { getNpmRootPath, loadConf } from '../src/server/conf.js';
import fs from 'fs-extra';
import { commitData } from '../src/client/components/core/CommonJs.js';

const npmRoot = getNpmRootPath();
const underpostRoot = `${npmRoot}/underpost/.env`;
fs.existsSync(underpostRoot) ? dotenv.config({ path: underpostRoot, override: true }) : dotenv.config();

const logger = loggerFactory(import.meta);

const program = new Command();

program.name('underpost').description(`underpost ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new')
  .argument('<app-name>', 'Application name')
  .description('Create a new project')
  .action(Underpost.repo.new);

program
  .command('clone')
  .argument(`<uri>`, 'e.g. username/repository')
  .description('Clone github repository')
  .action(Underpost.repo.clone);

program
  .command('pull')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<uri>`, 'e.g. username/repository')
  .description('Pull github repository')
  .action(Underpost.repo.pull);

program
  .command('cmt')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<commit-type>`, `Options: ${Object.keys(commitData)}`)
  .argument(`[module-tag]`, 'Optional set module tag')
  .argument(`[message]`, 'Optional set additional message')
  .option('--empty', 'Allow empty files')
  .option('--copy', 'Copy to clipboard message')
  .option('--info', 'Info commit types')
  .description('Commit github repository')
  .action(Underpost.repo.commit);

program
  .command('push')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<uri>`, 'e.g. username/repository')
  .description('Push github repository')
  .action(Underpost.repo.push);

program
  .command('env')
  .argument('<deploy-id>', 'deploy configuration id')
  .argument('[env]', 'Optional environment, for default is production')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(loadConf);

program
  .command('config')
  .argument('operator', `Options: ${Object.keys(Underpost.env)}`)
  .argument('[key]', 'Config key')
  .argument('[value]', 'Config value')
  .description(`Manage configuration, operators`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2]));

program
  .command('root')
  .description('Get npm root path')
  .action(() => console.log(getNpmRootPath()));

program.command('test').description('Run tests').action(Underpost.test.run);

program.parse();
