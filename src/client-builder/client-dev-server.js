/**
 * Module for creating a client-side development server
 * @module src/client-builder/client-dev-server.js
 * @namespace clientDevServer
 */
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { shellExec } from '../server/runtime/process.js';
import { exitOnSignals, watchRunnerFactory } from '../server/runtime/watch-runner.js';
import { loggerFactory } from '../server/ops/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @constant CLIENT_DEV_WATCH
 * @description What the client dev server watches, and the file that tells the live build which
 * sources changed.
 * @memberof clientDevServer
 */
const CLIENT_DEV_WATCH = Object.freeze({
  name: 'Client build',
  script: './src/client.build',
  directory: 'src/client',
  buildPathsFile: '/tmp/client.build.json',
});

/**
 * @function createClientDevServer
 * @description Creates a client-side development server.
 * @memberof clientDevServer
 * @param {string} deployId - The deployment ID.
 * @param {string} subConf - The sub-configuration.
 * @param {string} host - The host.
 * @param {string} path - The path.
 * @returns {Promise<{start: Function, close: Function}>} The running client build watcher.
 * @memberof clientDevServer
 */
const createClientDevServer = async (
  deployId = process.argv[2] || 'dd-default',
  subConf = process.argv[3] || '',
  host = process.argv[4] || 'default.net',
  path = process.argv[5] || '/',
) => {
  const devClientEnvPath = `./engine-private/conf/${deployId}/.env.${process.env.NODE_ENV}.${subConf}-dev-client`;
  if (fs.existsSync(devClientEnvPath)) dotenv.config({ path: devClientEnvPath, override: true });

  await Underpost.client.callback(deployId, `${subConf}-dev-client`.trim(), host, path);

  shellExec(`node src/server ${deployId} ${subConf}-dev-client`.trim(), {
    async: true,
  });

  const { buildPathsFile } = CLIENT_DEV_WATCH;
  if (fs.existsSync(buildPathsFile)) fs.removeSync(buildPathsFile);

  const runner = watchRunnerFactory({
    ...CLIENT_DEV_WATCH,
    args: [`${deployId}`, `${subConf}-dev-client`, `${host}`, `${path}`],
    // An empty list makes the live build rebuild everything, which covers a change with no file name.
    onRestart: (paths) => fs.writeFileSync(buildPathsFile, JSON.stringify(paths ?? [], null, 4)),
  });
  logger.info('Client build watcher', { ...CLIENT_DEV_WATCH, deployId, subConf, host, path });
  runner.start();
  exitOnSignals(runner);
  return runner;
};

export { CLIENT_DEV_WATCH, createClientDevServer };
