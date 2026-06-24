/**
 * Manages the startup and runtime configuration of Underpost applications.
 * @module src/server/start.js
 * @namespace UnderpostStartUp
 */

import fs from 'fs-extra';
import { awaitDeployMonitor } from './conf.js';
import { actionInitLog, loggerFactory } from './logger.js';
import { shellCd, shellExec } from './process.js';
import { RUNTIME_STATUS, setRuntimeStatus, startInternalStatusServer, deployStatusPort } from './runtime-status.js';
import Underpost from '../index.js';
const logger = loggerFactory(import.meta);

/**
 * @class UnderpostStartUp
 * @description Manages the startup and runtime configuration of Underpost applications.
 * @memberof UnderpostStartUp
 */
class UnderpostStartUp {
  /**
   * Holds the NETWORK configuration.
   * @memberof UnderpostStartUp
   * @type {Object}
   * @static
   */
  static NETWORK = {};
  static API = {
    /**
     * Gets the current NETWORK configuration.
     * @memberof UnderpostStartUp
     * @returns {Object} The current NETWORK configuration.
     */
    get NETWORK() {
      return UnderpostStartUp.NETWORK;
    },
    /**
     * Logs the runtime this.NETWORK configuration.
     * @memberof UnderpostStartUp
     */
    logRuntimeRouter: () => {
      const displayLog = {};

      for (const host of Object.keys(this.NETWORK))
        for (const path of Object.keys(this.NETWORK[host]))
          displayLog[this.NETWORK[host][path].publicHost] = this.NETWORK[host][path].local;

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
            if (!this.NETWORK[host]) this.NETWORK[host] = {};
            this.NETWORK[host][path] = {
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
     * @param {boolean} options.skipPullBase - Whether to skip pulling the base code.
     * @param {boolean} options.skipFullBuild - Whether to skip building the full client bundle.
     * @param {boolean} options.pullBundle - When true, download pre-built client bundle from Cloudinary via pull-bundle before starting.
     */
    async callback(
      deployId = 'dd-default',
      env = 'development',
      options = {
        build: false,
        run: false,
        underpostQuicklyInstall: false,
        skipPullBase: false,
        skipFullBuild: false,
        pullBundle: false,
      },
    ) {
      // Bring the internal status endpoint up first so Phase-2 readiness is
      // observable through every lifecycle phase, including build and init. Bind
      // the deployment-resolved port so it always matches the monitor's target.
      startInternalStatusServer(deployStatusPort(deployId, env));
      try {
        setRuntimeStatus(deployId, env, RUNTIME_STATUS.BUILD);
        if (options.build === true) await Underpost.start.build(deployId, env, options);
        setRuntimeStatus(deployId, env, RUNTIME_STATUS.INIT);
        if (options.run === true) await Underpost.start.run(deployId, env, options);
      } catch (error) {
        logger.error('Deployment build/init failed', { deployId, env, message: error?.message });
        setRuntimeStatus(deployId, env, RUNTIME_STATUS.ERROR);
        if (!Underpost.env.isInsideContainer()) throw error;
      }
    },
    /**
     * Run itc-scripts and builds client bundle.
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the build.
     * @param {boolean} options.skipPullBase - Whether to skip pulling the base code and use the current workspace code directly.
     * @param {boolean} options.underpostQuicklyInstall - Whether to use underpost quickly install.
     * @param {boolean} options.skipFullBuild - Whether to skip building the full client bundle.
     * @param {boolean} options.pullBundle - When true, download pre-built client bundle from Cloudinary via pull-bundle (must be pushed first with push-bundle).
     *   This flag is independent of skipFullBuild: it can be combined with skipFullBuild or used alone.
     * @param {boolean} options.privateTestRepo - When true, clone `engine-test-<id>` (the private test source repo
     *   published by `node bin/build <deployId> --update-private`) instead of the production `engine-<id>` repo.
     * @memberof UnderpostStartUp
     */
    async build(
      deployId = 'dd-default',
      env = 'development',
      options = { underpostQuicklyInstall: false, skipPullBase: false, skipFullBuild: false, pullBundle: false },
    ) {
      const buildBasePath = `/home/dd`;
      // `--private-test-repo` clones the isolated test source repo published by
      // `node bin/build <deployId> --update-private`, instead of the production one.
      const repoName = options?.privateTestRepo
        ? `engine-test-${deployId.split('-')[1]}`
        : `engine-${deployId.split('-')[1]}`;
      if (!options.skipPullBase) {
        shellExec(`cd ${buildBasePath} && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
        shellExec(`mkdir -p ${buildBasePath}/engine`);
        shellExec(`cd ${buildBasePath} && sudo cp -a ./${repoName}/. ./engine`);
        shellExec(`cd ${buildBasePath} && sudo rm -rf ./${repoName}`);
      }
      shellCd(`${buildBasePath}/engine`);
      Underpost.repo.privateEngineRepoFactory(deployId);
      shellExec(options?.underpostQuicklyInstall ? `underpost install` : `npm install`);
      shellExec(`node bin env ${deployId} ${env}`);
      if (fs.existsSync('./engine-private/itc-scripts')) {
        const itcScripts = await fs.readdir('./engine-private/itc-scripts');
        for (const itcScript of itcScripts)
          if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
      }
      if (options.pullBundle === true) shellExec(`node bin run pull-bundle --deploy-id ${deployId}`);
      else if (!options.skipFullBuild) shellExec(`node bin client ${deployId}`);
    },
    /**
     * Runs a deployment.
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the run.
     * @memberof UnderpostStartUp
     */
    async run(deployId = 'dd-default', env = 'development', options = {}) {
      const runCmd = env === 'production' ? 'run prod:container' : 'run dev:container';
      const makeDeployCallback = (cmd) => (code, out, msg) => {
        if (code !== 0) {
          logger.error(`Deployment process exited with code ${code}`, { cmd, msg });
          setRuntimeStatus(deployId, env, RUNTIME_STATUS.ERROR);
        }
      };
      if (fs.existsSync(`./engine-private/replica`)) {
        const replicas = await fs.readdir(`./engine-private/replica`);
        for (const replica of replicas) {
          if (!replica.match(deployId)) continue;
          shellExec(`node bin env ${replica} ${env}`);
          const replicaCmd = `npm ${runCmd} ${replica}`;
          shellExec(replicaCmd, { async: true, callback: makeDeployCallback(replicaCmd) });
          const result = await awaitDeployMonitor();
          if (result !== true) {
            setRuntimeStatus(deployId, env, RUNTIME_STATUS.ERROR);
            return;
          }
        }
      }
      shellExec(`node bin env ${deployId} ${env}`);
      const deployCmd = `npm ${runCmd} ${deployId}`;
      shellExec(deployCmd, { async: true, callback: makeDeployCallback(deployCmd) });
      const result = await awaitDeployMonitor(true);
      if (result === true) {
        if (env === 'production' && Underpost.env.isInsideContainer()) Underpost.secret.globalSecretClean();
        setTimeout(() => setRuntimeStatus(deployId, env, RUNTIME_STATUS.RUNNING));
      } else {
        setRuntimeStatus(deployId, env, RUNTIME_STATUS.ERROR);
      }
    },
  };
}

/**
 * Creates a keep-alive process to maintain server activity.
 * @memberof UnderpostStartUp
 * @returns
 */
const createKeepAliveProcess = async () =>
  await Underpost.start.listenPortController(Underpost.start.listenServerFactory(), ':');

export default UnderpostStartUp;

export { createKeepAliveProcess, UnderpostStartUp };
