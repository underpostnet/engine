/**
 * Manages the startup and runtime configuration of Underpost applications.
 * @module src/server/runtime/start.js
 * @namespace UnderpostStartUp
 */

import fs from 'fs-extra';
import { awaitDeployMonitor } from './conf.js';
import { actionInitLog, loggerFactory } from '../ops/logger.js';
import { shellArgumentFactory, shellCd, shellExec, shellExecAsync } from './process.js';
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
     * @param {boolean} options.skipPullRepoBase - Whether to skip pulling the engine source repository.
     * @param {boolean} options.skipPullPrivateRepo - Whether to skip cloning the private configuration repository.
     * @param {boolean} options.skipFullBuild - Whether to skip building the full client bundle.
     * @param {boolean} options.pullBundle - When true, download pre-built client bundle from Cloudinary via pull-bundle before starting.
     * @param {boolean} options.privateTestRepo - When true, the base pull clones `engine-test-<id>` instead of `engine-<id>`.
     */
    async callback(
      deployId = 'dd-default',
      env = 'development',
      options = {
        build: false,
        run: false,
        underpostQuicklyInstall: false,
        skipPullRepoBase: false,
        skipPullPrivateRepo: false,
        skipFullBuild: false,
        pullBundle: false,
        privateTestRepo: false,
      },
    ) {
      // Host configuration first: the pod command names only `start`, so the container env the
      // `underpost-config` Secret injects is folded into the host configuration store here rather than by
      // a second command the image's CLI might not have. A direct call, not a shell-out, so it
      // does not depend on CLI surface either.
      if (Underpost.state.isInsideContainer()) Underpost.host.load({ env });

      // One phase, and the source pull belongs to `build`: a pod arrives here either through
      // its bootstrap, which already replaced this checkout and linked the CLI, or with
      // `--build` and no `--skip-pull-repo-base`, which pulls it here. Every long step shells
      // out through `node bin`, so those run the pulled source either way.
      //
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
     * `underpost` command at it — the base pull that makes the rest of the flow independent
     * of how recently the npm package was published.
     *
     * One pull per container: {@link UnderpostStartUp.build} performs it unless
     * `--skip-pull-repo-base` says the pod's own bootstrap (`pod_bootstrap_cmd`) already
     * replaced the checkout and linked the CLI before `start` was ever invoked.
     * @param {string} deployId - The ID of the deployment.
     * @param {Object} [options] - Options for the pull.
     * @param {boolean} [options.underpostQuicklyInstall] - Use `underpost install` instead of `npm install`.
     * @param {boolean} [options.privateTestRepo] - Clone `engine-test-<id>` instead of `engine-<id>`.
     * @memberof UnderpostStartUp
     */
    pullRepoBase(deployId = 'dd-default', options = {}) {
      const buildBasePath = `/home/dd`;
      // `--private-test-repo` clones the isolated test source repo published by
      // `node bin/build <deployId> --update-private`, instead of the production one.
      const repoName = Underpost.repo.engineRepoFactory(deployId, { test: options?.privateTestRepo === true });
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
      const checkout = shellArgumentFactory(enginePath);
      const result = shellExec(
        `cd ${checkout} && npm link --force && ` +
          `test "$(readlink -f "$(command -v underpost)")" = "$(readlink -f ./bin/index.js)"`,
        {
          silent: true,
          silentOnError: true,
        },
      );
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
     * Materializes the deployment environment and builds the client bundle.
     *
     * Container-specific values are not applied by a script here: `app load` resolves the
     * deployment's `.env.<env>.oci` overlay when it runs inside a container, so the working tree
     * this build renders from already carries the cluster endpoints.
     * @param {string} deployId - The ID of the deployment.
     * @param {string} env - The environment of the deployment.
     * @param {Object} options - Options for the build.
     * @param {boolean} options.skipPullRepoBase - Whether to skip pulling the engine source repository and use the current workspace code directly.
     * @param {boolean} options.skipPullPrivateRepo - Whether to skip cloning the private configuration repository, for a pod whose bootstrap already placed `engine-private`.
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
      options = {
        underpostQuicklyInstall: false,
        skipPullRepoBase: false,
        skipPullPrivateRepo: false,
        skipFullBuild: false,
        pullBundle: false,
      },
    ) {
      if (options.skipPullRepoBase !== true) Underpost.start.pullRepoBase(deployId, options);
      shellCd(ENGINE_PATH);
      // Containers refresh private config because an image/bootstrap checkout may be stale.
      // Hosts keep their local checkout, while explicit skip preserves caller-provided config.
      if (options.skipPullPrivateRepo !== true)
        Underpost.repo.privateEngineRepoFactory(deployId, { force: Underpost.state.isInsideContainer() });
      // Awaited rather than blocking: these are the minutes-long steps of a deployment, and a
      // synchronous child stalls the event loop for its whole duration — leaving the status
      // endpoint bound but unable to answer, so telemetry went dark across the entire build.
      await shellExecAsync(options?.underpostQuicklyInstall ? `underpost install` : `npm install`);
      await shellExecAsync(`node bin app load --env ${env} --args deploy-id=${deployId}`);
      if (options.pullBundle === true) await shellExecAsync(`node bin run pull-bundle --deploy-id ${deployId}`);
      // `--env` is explicit rather than inherited: the container's ambient NODE_ENV comes from
      // the injected `underpost-config`, and a build that guesses it renders the wrong conf.
      else if (!options.skipFullBuild) await shellExecAsync(`node bin client ${deployId} --env ${env}`);
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

export { createKeepAliveProcess, UnderpostStartUp };
