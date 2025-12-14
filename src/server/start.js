/**
 * Manages the startup and runtime configuration of Underpost applications.
 * @module src/server/start.js
 * @namespace UnderpostStartUp
 */

import UnderpostDeploy from '../cli/deploy.js';
import fs from 'fs-extra';
import { awaitDeployMonitor } from './conf.js';
import { actionInitLog, loggerFactory } from './logger.js';
import { shellCd, shellExec } from './process.js';
import UnderpostRootEnv from '../cli/env.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostStartUp
 * @description Manages the startup and runtime configuration of Underpost applications.
 * @memberof UnderpostStartUp
 */
class UnderpostStartUp {
  static API = {
    /**
     * Logs the runtime network configuration.
     * @memberof UnderpostStartUp
     */
    logRuntimeRouter: () => {
      const displayLog = {};

      for (const host of Object.keys(UnderpostDeploy.NETWORK))
        for (const path of Object.keys(UnderpostDeploy.NETWORK[host]))
          displayLog[UnderpostDeploy.NETWORK[host][path].publicHost] = UnderpostDeploy.NETWORK[host][path].local;

      logger.info('Runtime network', displayLog);
    },
    /**
     * Creates a server factory.
     * @memberof UnderpostStartUp
     * @param {Function} logic - The logic to execute when the server is listening.
     * @returns {Object} An object with a listen method.
     */
    listenServerFactory: (logic = async () => {}) => {
      return {
        listen: async (...args) => {
          const msDelta = 1000;
          const msMax = 30 * 24 * 60 * 60 * 1000; // ~ 1 month
          let msCount = 0;
          setInterval(() => {
            msCount += msDelta;
            if (msCount >= msMax) {
              const message = 'Listen server factory timeout';
              logger.error(message);
              throw new Error(message);
            }
          }, msDelta);
          return (logic ? await logic(...args) : undefined, args[1]());
        },
      };
    },

    /**
     * Controls the listening port for a server.
     * @memberof UnderpostStartUp
     * @param {Object} server - The server to listen on.
     * @param {number|string} port - The port number or colon for all ports.
     * @param {Object} metadata - Metadata for the server.
     * @returns {Promise<boolean>} A promise that resolves to true if the server is listening, false otherwise.
     */
    listenPortController: async (server, port, metadata) =>
      new Promise((resolve) => {
        try {
          if (port === ':') {
            server.listen(port, actionInitLog);
            return resolve(true);
          }

          const { host, path, client, runtime, meta } = metadata;
          const error = [];
          if (port === undefined) error.push(`port`);
          if (host === undefined) error.push(`host`);
          if (path === undefined) error.push(`path`);
          if (client === undefined) error.push(`client`);
          if (runtime === undefined) error.push(`runtime`);
          if (meta === undefined) error.push(`meta`);
          if (error.length > 0) throw new Error('Listen port controller requires values: ' + error.join(', '));

          server.listen(port, () => {
            if (!UnderpostDeploy.NETWORK[host]) UnderpostDeploy.NETWORK[host] = {};
            UnderpostDeploy.NETWORK[host][path] = {
              meta,
              client,
              runtime,
              port,
              publicHost:
                port === 80
                  ? `http://${host}${path}`
                  : port === 443
                    ? `https://${host}${path}`
                    : `http://${host}:${port}${path}`,
              local: `http://localhost:${port}${path}`,
              apis: metadata.apis,
            };

            return resolve(true);
          });
        } catch (error) {
          logger.error(error, { metadata, port, stack: error.stack });
          resolve(false);
        }
      }),

    /**
     * Starts a deployment.
     * @memberof UnderpostStartUp
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the deployment.
     * @param {boolean} options.build - Whether to build the deployment.
     * @param {boolean} options.run - Whether to run the deployment.
     * @param {boolean} options.underpostQuicklyInstall - Whether to use underpost quickly install.
     */
    async callback(
      deployId = 'dd-default',
      env = 'development',
      options = { build: false, run: false, underpostQuicklyInstall: false },
    ) {
      UnderpostRootEnv.API.set('container-status', `${deployId}-${env}-build-deployment`);
      if (options.build === true) await UnderpostStartUp.API.build(deployId, env, options);
      UnderpostRootEnv.API.set('container-status', `${deployId}-${env}-initializing-deployment`);
      if (options.run === true) await UnderpostStartUp.API.run(deployId, env, options);
    },
    /**
     * Run itc-scripts and builds client bundle.
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the build.
     * @param {boolean} options.underpostQuicklyInstall - Whether to use underpost quickly install.
     * @memberof UnderpostStartUp
     */
    async build(deployId = 'dd-default', env = 'development', options = { underpostQuicklyInstall: false }) {
      const buildBasePath = `/home/dd`;
      const repoName = `engine-${deployId.split('-')[1]}`;
      shellExec(`cd ${buildBasePath} && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
      shellExec(`mkdir -p ${buildBasePath}/engine`);
      shellExec(`cd ${buildBasePath} && sudo cp -a ./${repoName}/. ./engine`);
      shellExec(`cd ${buildBasePath} && sudo rm -rf ./${repoName}`);
      shellExec(`cd ${buildBasePath}/engine && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}-private`);
      shellExec(`cd ${buildBasePath}/engine && sudo mv ./${repoName}-private ./engine-private`);
      shellCd(`${buildBasePath}/engine`);
      shellExec(options?.underpostQuicklyInstall ? `underpost install` : `npm install`);
      shellExec(`node bin/deploy conf ${deployId} ${env}`);
      if (fs.existsSync('./engine-private/itc-scripts')) {
        const itcScripts = await fs.readdir('./engine-private/itc-scripts');
        for (const itcScript of itcScripts)
          if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
      }
      shellExec(`node bin/deploy build-full-client ${deployId}`);
    },
    /**
     * Runs a deployment.
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the run.
     * @memberof UnderpostStartUp
     */
    async run(deployId = 'dd-default', env = 'development', options = {}) {
      const runCmd = env === 'production' ? 'run prod-img' : 'run dev-img';
      if (fs.existsSync(`./engine-private/replica`)) {
        const replicas = await fs.readdir(`./engine-private/replica`);
        for (const replica of replicas) {
          if (!replica.match(deployId)) continue;
          shellExec(`node bin/deploy conf ${replica} ${env}`);
          shellExec(`npm ${runCmd} ${replica}`, { async: true });
          await awaitDeployMonitor(true);
        }
      }
      shellExec(`node bin/deploy conf ${deployId} ${env}`);
      shellExec(`npm ${runCmd} ${deployId}`, { async: true });
      await awaitDeployMonitor(true);
      UnderpostRootEnv.API.set('container-status', `${deployId}-${env}-running-deployment`);
    },
  };
}

/**
 * Creates a keep-alive process to maintain server activity.
 * @memberof UnderpostStartUp
 * @returns
 */
const createKeepAliveProcess = async () =>
  await UnderpostStartUp.API.listenPortController(UnderpostStartUp.API.listenServerFactory(), ':');

export default UnderpostStartUp;

export { createKeepAliveProcess, UnderpostStartUp };
