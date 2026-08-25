/**
 * Manages the startup and runtime configuration of Underpost applications.
 * @module src/server/runtime/start.js
 * @namespace UnderpostStartUp
 */

import fs from 'fs-extra';
import { awaitDeployMonitor } from './conf.js';
import { actionInitLog, loggerFactory } from '../ops/logger.js';
import { shellCd, shellExec } from './process.js';
import {
  RUNTIME_STATUS,
  setRuntimeStatus,
  startInternalStatusServer,
  deployStatusPort,
  setStartContainerStatus,
} from './runtime-status.js';
import Underpost from '../../index.js';
const logger = loggerFactory(import.meta);

// Every deployment builds and runs out of this path inside the workload container.
const ENGINE_PATH = '/home/dd/engine';

/**
 * Renders the `underpost start` flags for the stage-2 re-entry.
 *
 * `--skip-pull-base` is always present: it is both the marker that the source is already in
 * place and the guard that makes the stage-1 branch unreachable a second time.
 * @param {object} [options] - Stage-1 options to carry across.
 * @returns {string} Space-separated flags.
 * @memberof UnderpostStartUp
 */
const startFlagsFactory = (options = {}) =>
  [
    options.build === true ? '--build' : '',
    options.run === true ? '--run' : '',
    options.underpostQuicklyInstall === true ? '--underpost-quickly-install' : '',
    options.skipFullBuild === true ? '--skip-full-build' : '',
    options.pullBundle === true ? '--pull-bundle' : '',
    options.privateTestRepo === true ? '--private-test-repo' : '',
    '--skip-pull-base',
  ]
    .filter(Boolean)
    .join(' ');

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
      // Host configuration first: the pod command names only `start`, so the container env the
      // `underpost-config` Secret injects is folded into the root env store here rather than by
      // a second command the image's CLI might not have. A direct call, not a shell-out, so it
      // does not depend on CLI surface either.
      if (Underpost.state.isInsideContainer()) Underpost.host.load({ env });

      // Stage 1. The `underpost` on PATH is the npm snapshot baked into the image, no newer
      // than the last publish — including this file. Pull the deployment's real source, point
      // the global CLI at it, and re-enter through that CLI, so every phase after this line
      // runs the code that was just pulled rather than the code that shipped in the image.
      //
      // Nothing is bound here: stage 2 owns the status server. The gap is safe because the
      // startupProbe (180 x 10s) suspends readiness and liveness across the whole build
      // window, and the monitor's default `exec` transport reads the file-backed
      // `container-status` store rather than the HTTP endpoint — a store both stages resolve
      // to the same path, since linking repoints only the bin and leaves the published
      // package directory `getUnderpostRootPath()` returns untouched.
      if (options.build === true && options.skipPullBase !== true) {
        setRuntimeStatus(deployId, env, RUNTIME_STATUS.BUILD);
        Underpost.start.pullBase(deployId, options);
        shellExec(`underpost start ${startFlagsFactory(options)} ${deployId} ${env}`);
        return;
      }
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
        if (!Underpost.state.isInsideContainer()) throw error;
      }
    },
    /**
     * Replaces `/home/dd/engine` with the deployment's own source and points the global
     * `underpost` command at it — the stage-1 bootstrap that makes the rest of the flow
     * independent of how recently the npm package was published.
     * @param {string} deployId - The ID of the deployment.
     * @param {Object} [options] - Options for the pull.
     * @param {boolean} [options.underpostQuicklyInstall] - Use `underpost install` instead of `npm install`.
     * @param {boolean} [options.privateTestRepo] - Clone `engine-test-<id>` instead of `engine-<id>`.
     * @memberof UnderpostStartUp
     */
    pullBase(deployId = 'dd-default', options = {}) {
      const buildBasePath = `/home/dd`;
      // `--private-test-repo` clones the isolated test source repo published by
      // `node bin/build <deployId> --update-private`, instead of the production one.
      const repoName = options?.privateTestRepo
        ? `engine-test-${deployId.split('-')[1]}`
        : `engine-${deployId.split('-')[1]}`;
      shellExec(`cd ${buildBasePath} && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
      shellExec(`mkdir -p ${ENGINE_PATH}`);
      shellExec(`cd ${buildBasePath} && sudo cp -a ./${repoName}/. ./engine`);
      shellExec(`cd ${buildBasePath} && sudo rm -rf ./${repoName}`);
      shellCd(ENGINE_PATH);
      // Dependencies before the link: stage 2 boots through this checkout's `bin/index.js`
      // and cannot start without its node_modules.
      shellExec(options?.underpostQuicklyInstall ? `underpost install` : `npm install`);
      Underpost.start.linkRuntimeCli();
    },
    /**
     * Repoints the global `underpost` command at the engine checkout.
     *
     * `--force` because the image already owns a global `underpost` from npm; without it npm
     * refuses the bin with `EEXIST`. Only the bin is repointed — the published package
     * directory stays in place, so `getUnderpostRootPath()` keeps resolving to it and both
     * stages share the one container state store holding `container-status`.
     *
     * Failure is not fatal. A host that cannot write its global prefix falls back to the npm
     * snapshot, which is exactly the behaviour before this step existed, rather than losing
     * the deployment over a link.
     * @param {string} [enginePath] - Checkout to link.
     * @returns {boolean} Whether the global command now resolves to the checkout.
     * @memberof UnderpostStartUp
     */
    linkRuntimeCli(enginePath = ENGINE_PATH) {
      const result = shellExec(`cd ${enginePath} && npm link --force`, {
        silent: true,
        silentOnError: true,
      });
      if (result?.code === 0) {
        logger.info('Global underpost CLI linked to the engine checkout', { enginePath });
        return true;
      }
      logger.warn('Could not link the global underpost CLI; continuing with the image snapshot', {
        enginePath,
        code: result?.code,
        stderr: `${result?.stderr ?? ''}`.trim().split('\n').slice(-1)[0],
      });
      return false;
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
      if (options.skipPullBase !== true) Underpost.start.pullBase(deployId, options);
      shellCd(ENGINE_PATH);
      Underpost.repo.privateEngineRepoFactory(deployId);
      // Installed again after the private repo lands: `pullBase` installs only what the CLI
      // needs to boot stage 2, which is resolved before `engine-private` is on disk.
      shellExec(options?.underpostQuicklyInstall ? `underpost install` : `npm install`);
      shellExec(`node bin app load --env ${env} --args deploy-id=${deployId}`);
      if (fs.existsSync('./engine-private/itc-scripts')) {
        const itcScripts = await fs.readdir('./engine-private/itc-scripts');
        for (const itcScript of itcScripts)
          if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
      }
      if (options.pullBundle === true) shellExec(`node bin run pull-bundle --deploy-id ${deployId}`);
      // `--env` is explicit rather than inherited: the container's ambient NODE_ENV comes from
      // the injected `underpost-config`, and a build that guesses it renders the wrong conf.
      else if (!options.skipFullBuild) shellExec(`node bin client ${deployId} --env ${env}`);
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
          shellExec(`node bin app load --env ${env} --args deploy-id=${replica}`);
          const replicaCmd = `npm ${runCmd} ${replica}`;
          shellExec(replicaCmd, { async: true, callback: makeDeployCallback(replicaCmd) });
          const result = await awaitDeployMonitor();
          if (result !== true) {
            setRuntimeStatus(deployId, env, RUNTIME_STATUS.ERROR);
            return;
          }
        }
      }
      shellExec(`node bin app load --env ${env} --args deploy-id=${deployId}`);
      const deployCmd = `npm ${runCmd} ${deployId}`;
      shellExec(deployCmd, { async: true, callback: makeDeployCallback(deployCmd) });
      const result = await awaitDeployMonitor(true);
      if (result === true) {
        // Withdraw every domain's local traces once the deployment is serving. Three calls
        // rather than one cross-domain sweep: each domain owns what it put on disk.
        if (env === 'production' && Underpost.state.isInsideContainer())
          for (const domain of [Underpost.secret, Underpost.host, Underpost.app])
            domain.clean({ env, namespace: 'default', args: {}, dryRun: false, force: false });
        setTimeout(() => {
          setRuntimeStatus(deployId, env, RUNTIME_STATUS.RUNNING);
          setStartContainerStatus(deployId, env);
        });
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

export { createKeepAliveProcess, startFlagsFactory, UnderpostStartUp };
