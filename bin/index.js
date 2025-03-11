#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost from '../src/index.js';
import { getUnderpostRootPath, loadConf } from '../src/server/conf.js';
import fs from 'fs-extra';
import { commitData } from '../src/client/components/core/CommonJs.js';
import UnderpostScript from '../src/cli/script.js';
import UnderpostDB from '../src/cli/db.js';
import UnderpostCron from '../src/cli/cron.js';

const underpostRootPath = getUnderpostRootPath();
fs.existsSync(`${underpostRootPath}/.env`)
  ? dotenv.config({ path: `${underpostRootPath}/.env`, override: true })
  : dotenv.config();

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
  .option('--bare', 'Clone only .git files')
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
  .option('-f', 'Force push overwriting repository')
  .description('Push github repository')
  .action(Underpost.repo.push);

program
  .command('env')
  .argument('<deploy-id>', `deploy configuration id, if 'clean' restore default`)
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

program
  .command('cluster')
  .argument('[pod-name]', 'Optional pod name filter')
  .option('--reset', `Delete all clusters and prune all data and caches`)
  .option('--mariadb', 'Init with mariadb statefulset')
  .option('--mongodb', 'Init with mongodb statefulset')
  .option('--mongodb4', 'Init with mongodb 4.4 service')
  .option('--valkey', 'Init with valkey service')
  .option('--contour', 'Init with project contour base HTTPProxy and envoy')
  .option('--cert-manager', 'Init with letsencrypt-prod ClusterIssuer')
  .option('--info', 'Get all kinds objects deployed')
  .option('--full', 'Init with all statefulsets and services available')
  .option('--ns-use <ns-name>', 'Switches current context to namespace')
  .option('--dev', 'init with dev cluster')
  .option('--list-pods', 'Display list pods information')
  .action(Underpost.cluster.init)
  .description('Manage cluster, for default initialization base kind cluster');

program
  .command('deploy')
  .argument('<deploy-list>', 'Deploy id list, e.g. default-a,default-b')
  .argument('[env]', 'Optional environment, for default is development')
  .option('--remove', 'Delete deployments and services')
  .option('--sync', 'Sync deployments env, ports, and replicas')
  .option('--info-router', 'Display router structure')
  .option('--expose', 'Expose service match deploy-list')
  .option('--info-util', 'Display kubectl util management commands')
  .option('--build-manifest', 'Build kind yaml manifests: deployments, services, proxy and secrets')
  .description('Manage deployment, for default deploy development pods')
  .action(Underpost.deploy.callback);

program
  .command('secret')
  .argument('<platform>', `Options: ${Object.keys(Underpost.secret)}`)
  .option('--init', 'Init secrets platform environment')
  .option('--create-from-file <path-env-file>', 'Create secret from env file')
  .option('--list', 'Lists secrets')
  // .option('--delete [secret-key]', 'Delete key secret, if not set, are default delete all')
  // .option('--create [secret-key] [secret-value]', 'Create secret key, with secret value')
  .description(`Manage secrets`)
  .action((...args) => {
    if (args[1].createFromFile) return Underpost.secret[args[0]].createFromEnvFile(args[1].createFromFile);
    if (args[1].list) return Underpost.secret[args[0]].list();
    if (args[1].init) return Underpost.secret[args[0]].init();
  });

program
  .command('dockerfile-node-script')
  .argument('<deploy-id>', 'Deploy configuration id')
  .argument('[env]', 'Optional environment, for default is development')
  .option('--run', 'Run custom entry point script')
  .description('Dockerfile custom node build script')
  .action(Underpost.image.dockerfile.script);

program
  .command('dockerfile-image-build')
  .argument('<deploy-id>', 'Deploy configuration id')
  .argument('[env]', 'Optional environment, for default is development')
  .argument('[path]', 'Absolute or relative directory, for default is current')
  .option('--image-archive', 'Only load tar image from ./images')
  .option('--podman-save', 'Save image from podman to ./images')
  .description('Build image from Dockerfile')
  .action(Underpost.image.dockerfile.build);

program
  .command('dockerfile-pull-base-images')
  .description('Pull underpost dockerfile images requirements')
  .action(Underpost.image.dockerfile.pullBaseImages);

program
  .command('install')
  .description('Fast import underpost npm dependencies')
  .action(() => {
    fs.copySync(`${underpostRootPath}/node_modules`, './node_modules');
  });

program
  .command('db')
  .argument('<deploy-list>', 'Deploy id list, e.g. default-a,default-b')
  .option('--import', 'Import container backups from repositories')
  .option('--export', 'Export container backups to repositories')
  .option('--pod-name <pod-name>', 'Optional pod context')
  .option('--ns <ns-name>', 'Optional name space context')
  .description('Manage databases')
  .action(UnderpostDB.API.callback);

program
  .command('script')
  .argument('operator', `Options: ${Object.keys(UnderpostScript.API)}`)
  .argument('<script-name>', 'Script name')
  .argument('[script-value]', 'Literal command, or path')
  .option('--itc', 'Inside container execution context')
  .option('--itc-path', 'Inside container path options')
  .option('--ns <ns-name>', 'Options name space context')
  .option('--pod-name <pod-name>')
  .description(
    'Supports a number of built-in underpost global scripts and their preset life cycle events as well as arbitrary scripts',
  )
  .action((...args) => Underpost.script[args[0]](args[1], args[2], args[3]));

program
  .command('cron')
  .argument('[deploy-list]', 'Deploy id list, e.g. default-a,default-b')
  .argument('[job-list]', `Deploy id list, e.g. ${Object.keys(UnderpostCron.JOB)}, for default all available jobs`)
  .option('--itc', 'Inside container execution context')
  .option('--init', 'Init cron jobs for cron job default deploy id')
  .description('Cron jobs management')
  .action(Underpost.cron.callback);

program
  .command('fs')
  .argument('[path]', 'Absolute or relative directory')
  .option('--rm', 'Remove file')
  .option('--git', 'Current git changes')
  .option('--recursive', 'Upload files recursively')
  .option('--deploy-id <deploy-id>', 'Deploy configuration id')
  .option('--pull', 'Download file')
  .option('--force', 'Force action')
  .description('File storage management, for default upload file')
  .action(Underpost.fs.callback);

program
  .command('test')
  .argument('[deploy-list]', 'Deploy id list, e.g. default-a,default-b')
  .description('Manage Test, for default run current underpost default test')
  .option('--itc', 'Inside container execution context')
  .option('--sh', 'Copy to clipboard, container entrypoint shell command')
  .option('--logs', 'Display container logs')
  .option('--pod-name <pod-name>')
  .option('--pod-status <pod-status>')
  .option('--kind-type <kind-type>')
  .action(Underpost.test.callback);

program.parse();
