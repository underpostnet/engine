/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, pbcopy, shellCd, shellExec } from '../server/process.js';
import crypto from 'crypto';
import {
  awaitDeployMonitor,
  buildKindPorts,
  Config,
  getNpmRootPath,
  isDeployRunnerContext,
  loadConfServerJson,
  writeEnv,
} from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';

import fs from 'fs-extra';
import net from 'net';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';

import os from 'os';
import Underpost from '../index.js';
import dotenv from 'dotenv';

const waitForPort = (port, host = '127.0.0.1', { maxAttempts = 30, interval = 2000 } = {}) =>
  new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      attempts++;
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (attempts >= maxAttempts) return reject(new Error(`Port ${port} not ready after ${maxAttempts} attempts`));
        setTimeout(tryConnect, interval);
      });
    };
    tryConnect();
  });

const logger = loggerFactory(import.meta);

/**
 * @constant DEFAULT_OPTION
 * @description Default options for the UnderpostRun class.
 * @type {Object}
 * @property {boolean} dev - Whether to run in development mode.
 * @property {string} podName - The name of the pod to run.
 * @property {string} nodeName - The name of the node to run.
 * @property {number} port - Custom port to use.
 * @property {string} volumeHostPath - The host path for the volume.
 * @property {string} volumeMountPath - The mount path for the volume.
 * @property {string} imageName - The name of the image to run.
 * @property {string} containerName - The name of the container to run.
 * @property {string} namespace - The namespace to run in.
 * @property {string} timeoutResponse - The response timeout duration.
 * @property {string} timeoutIdle - The idle timeout duration.
 * @property {string} retryCount - The number of retries.
 * @property {string} retryPerTryTimeout - The timeout duration per retry.
 * @property {boolean} build - Whether to build the image.
 * @property {number} replicas - The number of replicas to run.
 * @property {boolean} force - Whether to force the operation.
 * @property {boolean} reset - Whether to reset the operation.
 * @property {boolean} tls - Whether to use TLS.
 * @property {string} cmd - The command to run in the container.
 * @property {string} tty - The TTY option for the container.
 * @property {string} stdin - The stdin option for the container.
 * @property {string} restartPolicy - The restart policy for the container.
 * @property {string} runtimeClassName - The runtime class name for the container.
 * @property {string} imagePullPolicy - The image pull policy for the container.
 * @property {string} apiVersion - The API version for the container.
 * @property {string} claimName - The claim name for the volume.
 * @property {string} kindType - The kind of resource to create.
 * @property {number} devProxyPortOffset - The port offset for the development proxy.
 * @property {boolean} hostNetwork - Whether to use host networking.
 * @property {string} requestsMemory - The memory request for the container.
 * @property {string} requestsCpu - The CPU request for the container.
 * @property {string} limitsMemory - The memory limit for the container.
 * @property {string} limitsCpu - The CPU limit for the container.
 * @property {string} resourceTemplateId - The resource template ID.
 * @property {boolean} expose - Whether to expose the service.
 * @property {boolean} etcHosts - Whether to modify /etc/hosts.
 * @property {string} confServerPath - The configuration server path.
 * @property {string} underpostRoot - The root path of the Underpost installation.
 * @property {string} cmdCronJobs - Pre-script commands to run before cron job execution.
 * @property {string} deployIdCronJobs - The deployment ID for cron jobs.
 * @property {string} timezone - The timezone to set.
 * @property {boolean} kubeadm - Whether to run in kubeadm mode.
 * @property {boolean} kind - Whether to run in kind mode.
 * @property {boolean} k3s - Whether to run in k3s mode.
 * @property {string} hosts - The hosts to use.
 * @property {string} deployId - The deployment ID.
 * @property {string} instanceId - The instance ID.
 * @property {string} user - The user to run as.
 * @property {string} pid - The process ID.
 * @property {boolean} disablePrivateConfUpdate - Whether to disable private configuration updates.
 * @property {string} monitorStatus - The monitor status option.
 * @property {string} monitorStatusKindType - The monitor status kind type option.
 * @property {string} monitorStatusDeltaMs - The monitor status delta in milliseconds.
 * @property {string} monitorStatusMaxAttempts - The maximum number of attempts for monitor status.
 * @property {boolean} logs - Whether to enable logs.
 * @property {boolean} dryRun - Whether to perform a dry run.
 * @property {boolean} createJobNow - Whether to create the job immediately.
 * @property {number} fromNCommit - Number of commits back to use for message propagation (default: 1, last commit only).
 * @property {string|Array<{ip: string, hostnames: string[]}>} hostAliases - Adds entries to the Pod /etc/hosts via Kubernetes hostAliases.
 *   As a string (CLI): semicolon-separated entries of "ip=hostname1,hostname2" (e.g., "127.0.0.1=foo.local,bar.local;10.1.2.3=foo.remote").
 *   As an array (programmatic): objects with `ip` and `hostnames` fields (e.g., [{ ip: "127.0.0.1", hostnames: ["foo.local"] }]).
 * @memberof UnderpostRun
 */
const DEFAULT_OPTION = {
  dev: false,
  podName: '',
  nodeName: '',
  port: 0,
  volumeHostPath: '',
  volumeMountPath: '',
  imageName: '',
  containerName: '',
  namespace: 'default',
  timeoutResponse: '',
  timeoutIdle: '',
  retryCount: '',
  retryPerTryTimeout: '',
  build: false,
  replicas: 1,
  force: false,
  reset: false,
  tls: false,
  cmd: '',
  tty: '',
  stdin: '',
  restartPolicy: '',
  runtimeClassName: '',
  imagePullPolicy: '',
  apiVersion: '',
  claimName: '',
  kindType: '',
  devProxyPortOffset: 0,
  hostNetwork: false,
  requestsMemory: '',
  requestsCpu: '',
  limitsMemory: '',
  limitsCpu: '',
  resourceTemplateId: '',
  expose: false,
  etcHosts: false,
  confServerPath: '',
  underpostRoot: '',
  cmdCronJobs: '',
  deployIdCronJobs: '',
  timezone: '',
  kubeadm: false,
  kind: false,
  k3s: false,
  hosts: '',
  deployId: '',
  instanceId: '',
  user: '',
  pid: '',
  disablePrivateConfUpdate: false,
  monitorStatus: '',
  monitorStatusKindType: '',
  monitorStatusDeltaMs: '',
  monitorStatusMaxAttempts: '',
  logs: false,
  dryRun: false,
  createJobNow: false,
  fromNCommit: 0,
  hostAliases: '',
  gitClean: false,
  copy: false,
};

/**
 * @class UnderpostRun
 * @description Manages the execution of various CLI commands and operations.
 * This class provides a set of static methods to perform different tasks
 * such as running tests, deploying applications, managing environment variables,
 * and more. It also includes a default option configuration and a collection of
 * runners for executing specific commands.
 * @memberof UnderpostRun
 */
class UnderpostRun {
  /**
   * @static
   * @description Collection of runners for executing specific commands.
   * @type {Object}
   * @memberof UnderpostRun
   */
  static RUNNERS = {
    /**
     * @method dev-cluster
     * @description Resets and deploys a full development cluster including MongoDB, Valkey, exposes services, and updates `/etc/hosts` for local access.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-cluster': (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const mongoHosts = ['mongodb-0.mongodb-service'];
      if (!options.expose) {
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --reset`);
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''}`);

        shellExec(
          `${baseCommand} cluster${options.dev ? ' --dev' : ''} --mongodb --mongo-db-host ${mongoHosts.join(
            ',',
          )} --pull-image`,
        );
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --valkey --pull-image`);
      }

      {
        // Detect MongoDB primary pod using method
        let primaryMongoHost = 'mongodb-0.mongodb-service';
        try {
          const primaryPodName = Underpost.db.getMongoPrimaryPodName({
            namespace: options.namespace,
            podName: 'mongodb-0',
          });
          // shellExec(`${baseCommand} deploy --expose --disable-update-underpost-config mongo`, { async: true });
          shellExec(`kubectl port-forward -n ${options.namespace} pod/${primaryPodName} 27017:27017`, { async: true });
          shellExec(
            `${baseCommand} deploy --expose --namespace ${options.namespace} --disable-update-underpost-config valkey`,
            { async: true },
          );
        } catch (error) {
          logger.warn('Failed to detect MongoDB primary pod, using default', {
            error: error.message,
            default: primaryMongoHost,
          });
        }

        const hostListenResult = Underpost.deploy.etcHostFactory([primaryMongoHost]);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method ipfs-expose
     * @description Exposes IPFS Cluster services on specified ports for local access.
     * @type {Function}
     * @memberof UnderpostRun
     */
    'ipfs-expose': (path, options = DEFAULT_OPTION) => {
      const ports = [5001, 9094, 8080];
      for (const port of ports)
        shellExec(`node bin deploy --expose ipfs-cluster --expose-port ${port} --disable-update-underpost-config`, {
          async: true,
        });
    },

    /**
     * @method metadata
     * @description Generates metadata for the specified path after exposing the development cluster.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    metadata: async (path, options = DEFAULT_OPTION) => {
      const ports = '6379,27017';
      shellExec(`node bin run kill '${ports}'`);
      shellExec(`node bin run dev-cluster --dev --expose --namespace ${options.namespace}`, { async: true });
      logger.info('Waiting for port-forward services to be ready...');
      try {
        await Promise.all([waitForPort(27017), waitForPort(6379)]);
        logger.info('Port-forward services are ready');
      } catch (err) {
        logger.error('Port-forward services failed to become ready', { error: err.message });
        shellExec(`node bin run kill '${ports}'`);
        throw err;
      }
      shellExec(`node bin metadata --generate ${path}`);
      shellExec(`node bin db --dev --clean-fs-collection dd`);
      shellExec(`node bin run kill '${ports}'`);
    },

    /**
     * @method svc-ls
     * @description Lists systemd services and installed packages, optionally filtering by the provided path.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional filter for services and packages).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'svc-ls': (path, options = DEFAULT_OPTION) => {
      const log = shellExec(`systemctl list-units --type=service${path ? ` | grep ${path}` : ''}`, {
        silent: true,
        stdout: true,
      });
      console.log(path ? log.replaceAll(path, path.red) : log);
      const log0 = shellExec(`sudo dnf list installed${path ? ` | grep ${path}` : ''}`, {
        silent: true,
        stdout: true,
      });
      console.log(path ? log0.replaceAll(path, path.red) : log0);
    },

    /**
     * @method svc-rm
     * @description Removes a systemd service by stopping it, disabling it, uninstalling the package, and deleting related files.
     * @param {string} path - The input value, identifier, or path for the operation (used as the service name).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'svc-rm': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo systemctl stop ${path}`);
      shellExec(`sudo systemctl disable --now ${path}`);
      shellExec(`sudo dnf remove -y ${path}*`);
      shellExec(`sudo rm -f /usr/lib/systemd/system/${path}.service`);
      shellExec(`sudo rm -f /etc/yum.repos.d/${path}*.repo`);
    },

    /**
     * @method ssh-deploy-info
     * @description Retrieves deployment status and pod information from a remote server via SSH.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy-info': async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      await Underpost.ssh.sshRemoteRunner(
        `node bin deploy ${path ? path : 'dd'} ${env} --status && kubectl get pods -A`,
        {
          deployId: options.deployId,
          user: options.user,
          dev: options.dev,
          remote: true,
          useSudo: true,
          cd: '/home/dd/engine',
        },
      );
    },

    /**
     * @method dev-hosts-expose
     * @description Deploys a specified service in development mode with `/etc/hosts` modification for local access.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID to deploy).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-hosts-expose': (path, options = DEFAULT_OPTION) => {
      shellExec(
        `node bin deploy ${path} development --disable-update-deployment --disable-update-proxy --kubeadm --etc-hosts`,
      );
    },

    /**
     * @method dev-hosts-restore
     * @description Restores the `/etc/hosts` file to its original state after modifications made during development deployments.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-hosts-restore': (path, options = DEFAULT_OPTION) => {
      shellExec(`node bin deploy --restore-hosts`);
    },

    /**
     * @method cluster-build
     * @description Build configuration for cluster deployment.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'cluster-build': (path, options = DEFAULT_OPTION) => {
      const nodeOptions = options.nodeName ? ` --node-name ${options.nodeName}` : '';
      shellExec(`node bin run clean`);
      shellExec(`node bin run --dev sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin run sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin env clean`);
      for (const deployId of fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').split(','))
        shellExec(`node bin new --default-conf --deploy-id ${deployId.trim()}`);
      if (path === 'cmt') {
        shellExec(`git add . && underpost cmt . build cluster-build`);
        shellExec(`cd engine-private && git add . && underpost cmt . build cluster-build`);
      }
    },
    /**
     * @method template-deploy
     * @description Pushes `engine-private`, dispatches CI workflow to build `pwa-microservices-template`,
     * and optionally triggers engine-<conf-id> CI with sync/init which in turn dispatches the CD workflow
     * after the build chain completes (template → ghpkg → engine-<conf-id> → CD).
     * @param {string} path - The deployment path identifier (e.g., 'sync-engine-core', 'init-engine-core', or empty for build-only).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`npm run security:secrets`);
      const reportPath = './gitleaks-report.json';
      if (fs.existsSync(reportPath) && JSON.parse(fs.readFileSync(reportPath, 'utf8')).length > 0) {
        logger.error('Secrets detected in gitleaks-report.json, aborting template-deploy');
        return;
      }
      shellExec(`${baseCommand} run pull`);

      // Capture last N commit messages for propagation.
      // When --from-n-commit is not set, auto-detect unpushed commit count (same as --unpush flag).
      const fromN =
        options.fromNCommit && parseInt(options.fromNCommit) > 0
          ? parseInt(options.fromNCommit)
          : Underpost.repo.getUnpushedCount('.').count;
      const message = shellExec(`node bin cmt --changelog ${fromN} --changelog-no-hash`, {
        silent: true,
        stdout: true,
      }).trim();

      shellExec(
        `${baseCommand} push ./engine-private ${options.force ? '-f ' : ''}${
          process.env.GITHUB_USERNAME
        }/engine-private`,
      );
      shellCd('/home/dd/engine');

      const sanitizedMessage = Underpost.repo.sanitizeChangelogMessage(message);

      // Push engine repo so workflow YAML changes reach GitHub
      shellExec(`git reset`);
      shellExec(`${baseCommand} push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`);

      // Determine deploy conf and type from path (sync-engine-core, init-engine-core, etc.)
      let deployConfId = '';
      let deployType = '';
      if (path.startsWith('sync-')) {
        deployConfId = path.replace(/^sync-/, '');
        deployType = 'sync-and-deploy';
      } else if (path.startsWith('init-')) {
        deployConfId = path.replace(/^init-/, '');
        deployType = 'init';
      }

      // Dispatch npmpkg CI workflow — this builds pwa-microservices-template first.
      // If deployConfId is set, npmpkg.ci.yml will dispatch the engine-<conf-id> CI
      // with sync=true after template build completes. The engine CI then dispatches
      // the CD workflow after the engine repo build finishes — ensuring correct sequence:
      // npmpkg.ci → engine-<id>.ci → engine-<id>.cd
      const repo = `${process.env.GITHUB_USERNAME}/engine`;
      const inputs = {};
      if (sanitizedMessage) inputs.message = sanitizedMessage;
      if (deployConfId) inputs.deploy_conf_id = deployConfId;
      if (deployType) inputs.deploy_type = deployType;

      Underpost.repo.dispatchWorkflow({
        repo,
        workflowFile: 'npmpkg.ci.yml',
        ref: 'master',
        inputs,
      });
    },

    /**
     * @method template-deploy-local
     * @description Similar to `template-deploy` but runs the workflow locally without dispatching GitHub Actions. It pulls the latest changes, pushes to GitHub, builds the template, and optionally triggers a local release with CI push.
     * @param {string} path - The deployment path identifier (e.g., 'sync-engine-core', 'init-engine-core', or empty for build-only).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy-local': async (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`npm run security:secrets`);
      const reportPath = './gitleaks-report.json';
      if (fs.existsSync(reportPath) && JSON.parse(fs.readFileSync(reportPath, 'utf8')).length > 0) {
        logger.error('Secrets detected in gitleaks-report.json, aborting template-deploy');
        return;
      }
      shellExec(`${baseCommand} run pull`);

      // Capture last N commit messages from the engine repo.
      // When --from-n-commit is not set, auto-detect unpushed commit count (same as --unpush flag).
      const fromN =
        options.fromNCommit && parseInt(options.fromNCommit) > 0
          ? parseInt(options.fromNCommit)
          : Underpost.repo.getUnpushedCount('.').count;
      const rawMessage = shellExec(`node bin cmt --changelog ${fromN} --changelog-no-hash`, {
        silent: true,
        stdout: true,
      }).trim();
      const sanitizedMessage = Underpost.repo.sanitizeChangelogMessage(rawMessage);

      const { triggerCmd } = path
        ? await Underpost.release.ci(path, sanitizedMessage, options)
        : await Underpost.release.pwa(sanitizedMessage, options);
      pbcopy(triggerCmd + ' && cd /home/dd/engine');
    },
    /**
     * @method docker-image
     * @description Dispatches the Docker image CI workflow (`docker-image.ci.yml`) for the `engine` repository via `workflow_dispatch`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'docker-image': (path, options = DEFAULT_OPTION) => {
      Underpost.repo.dispatchWorkflow({
        repo: `${process.env.GITHUB_USERNAME}/engine`,
        workflowFile: `docker-image${path ? `.${path}` : ''}.ci.yml`,
        ref: 'master',
        inputs: {},
      });
    },
    /**
     * @method clean
     * @description Changes directory to the provided path (defaulting to `/home/dd/engine`) and runs `node bin/deploy clean-core-repo`.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional directory path).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    clean: (path = '', options = DEFAULT_OPTION) => {
      Underpost.repo.clean({ paths: path ? path.split(',') : ['/home/dd/engine', '/home/dd/engine/engine-private'] });
    },
    /**
     * @method pull
     * @description Clones or pulls updates for the `engine` and `engine-private` repositories into `/home/dd/engine` and `/home/dd/engine/engine-private`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    pull: (path, options = DEFAULT_OPTION) => {
      if (!fs.existsSync(`/home/dd`) || !fs.existsSync(`/home/dd/engine`)) {
        fs.mkdirSync(`/home/dd`, { recursive: true });
        shellExec(`cd /home/dd && underpost clone ${process.env.GITHUB_USERNAME}/engine`, {
          silent: true,
        });
      } else {
        shellExec(`underpost run clean`);
        shellExec(`cd /home/dd/engine && underpost pull . ${process.env.GITHUB_USERNAME}/engine`, {
          silent: true,
        });
      }
      if (!fs.existsSync(`/home/dd/engine/engine-private`))
        shellExec(`cd /home/dd/engine && underpost clone ${process.env.GITHUB_USERNAME}/engine-private`, {
          silent: true,
        });
      else
        shellExec(
          `cd /home/dd/engine/engine-private && underpost pull . ${process.env.GITHUB_USERNAME}/engine-private`,
          {
            silent: true,
          },
        );
    },
    /**
     * @method release-deploy
     * @description Executes deployment (`underpost run deploy`) for all deployment IDs listed in `./engine-private/deploy/dd.router`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'release-deploy': (path, options = DEFAULT_OPTION) => {
      actionInitLog();
      shellExec(`underpost --version`);
      shellCd(`/home/dd/engine`);
      for (const _deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
        const deployId = _deployId.trim();
        shellExec(`underpost run deploy ${deployId}`, { async: true });
      }
    },
    /**
     * @method ssh-deploy
     * @description Dispatches the corresponding CD workflow for SSH-based deployment, replacing empty commits with workflow_dispatch.
     * @param {string} path - The deployment identifier (e.g., 'engine-core', 'sync-engine-core', 'init-engine-core').
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy': (path, options = DEFAULT_OPTION) => {
      actionInitLog();

      let job = 'deploy';
      let confId = path;
      if (path.startsWith('sync-')) {
        job = 'sync-and-deploy';
        confId = path.replace(/^sync-/, '');
      } else if (path.startsWith('init-')) {
        job = 'init';
        confId = path.replace(/^init-/, '');
      }

      Underpost.repo.dispatchWorkflow({
        repo: `${process.env.GITHUB_USERNAME}/engine`,
        workflowFile: `${confId}.cd.yml`,
        ref: 'master',
        inputs: { job },
      });
    },
    /**
     * @method ide
     * @description Opens a Visual Studio Code (VS Code) session for the specified path using `node ${underpostRoot}/bin/zed ${path}`,
     * or installs Zed and sublime-text IDE if `path` is 'install'.
     * @param {string} path - The input value, identifier, or path for the operation (used as the path to the directory to open in the IDE).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ide: (path = '', options = DEFAULT_OPTION) => {
      const underpostRoot = options.dev ? '.' : options.underpostRoot;
      const [projectPath, customIde] = path.split(',');
      if (projectPath === 'install') {
        if (customIde === 'zed') shellExec(`sudo curl -f https://zed.dev/install.sh | sh`);
        else if (customIde === 'subl') {
          shellExec(
            `sudo dnf config-manager --add-repo https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo`,
          );
          shellExec(`sudo dnf install -y sublime-text`);
        } else {
          shellExec(`sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc &&
echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\nautorefresh=1\ntype=rpm-md\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" | sudo tee /etc/yum.repos.d/vscode.repo > /dev/null`);
          shellExec(`sudo dnf install -y code`);
        }
        return;
      }
      if (customIde === 'zed') shellExec(`node ${underpostRoot}/bin/zed ${projectPath}`);
      else shellExec(`node ${underpostRoot}/bin/vs ${projectPath}`);
    },
    /**
     * @method crypto-policy
     * @description Sets the system's crypto policies to `DEFAULT:SHA1` using `update-crypto-policies` command.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'crypto-policy': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo update-crypto-policies --set DEFAULT:SHA1`);
    },
    /**
     * @method sync
     * @description Cleans up, and then runs a deployment synchronization command (`underpost deploy --kubeadm --build-manifest --sync...`) using parameters parsed from `path` (deployId, replicas, versions, image, node).
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string containing deploy parameters).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sync: async (path, options = DEFAULT_OPTION) => {
      // Dev usage: node bin run --dev --build sync dd-default
      const env = options.dev ? 'development' : 'production';
      const baseCommand = 'node bin'; // options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const clusterFlag = options.k3s ? ' --k3s' : options.kind ? ' --kind' : ' --kubeadm';
      const defaultPath = [
        'dd-default',
        options.replicas,
        ``,
        ``,
        !options.kubeadm && !options.k3s ? 'kind-control-plane' : os.hostname(),
      ];
      let [deployId, replicas, versions, image, node] = path ? path.split(',') : defaultPath;
      deployId = deployId ? deployId : defaultPath[0];
      replicas = replicas ? replicas : defaultPath[1];
      versions = versions ? versions.replaceAll('+', ',') : defaultPath[2];
      image = image ? image : defaultPath[3];
      node = node ? node : defaultPath[4];
      shellExec(`${baseCommand} cluster --ns-use ${options.namespace}`);
      if (isDeployRunnerContext(path, options)) {
        if (!options.disablePrivateConfUpdate) {
          const { validVersion } = Underpost.repo.privateConfUpdate(deployId);
          if (!validVersion) throw new Error('Version mismatch');
        }
        if (options.timezone !== 'none') shellExec(`${baseCommand} run${baseClusterCommand} tz`);
        if (options.deployIdCronJobs !== 'none')
          shellExec(`node bin cron${baseClusterCommand}${clusterFlag} --setup-start --git --apply`);
      }

      const currentTraffic = isDeployRunnerContext(path, options)
        ? Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace })
        : '';
      let targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'green';
      if (targetTraffic) versions = versions ? versions : targetTraffic;

      const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
      const cmdString = options.cmd
        ? ' --cmd ' + (options.cmd.find((c) => c.match('"')) ? '"' + options.cmd + '"' : "'" + options.cmd + "'")
        : '';
      const gitCleanFlag = options.gitClean ? ' --git-clean' : '';

      shellExec(
        `${baseCommand} deploy${clusterFlag} --build-manifest --sync --info-router --replicas ${replicas} --node ${node}${
          image ? ` --image ${image}` : ''
        }${versions ? ` --versions ${versions}` : ''}${
          options.namespace ? ` --namespace ${options.namespace}` : ''
        }${timeoutFlags}${cmdString}${gitCleanFlag} ${deployId} ${env}`,
      );

      if (isDeployRunnerContext(path, options)) {
        // Backup app/services repositories with repo-backup configured
        shellExec(
          `${baseCommand} db ${deployId} ${clusterFlag}${baseClusterCommand} --repo-backup --primary-pod --git --force-clone --preserveUUID ${options.namespace ? ` --ns ${options.namespace}` : ''}`,
        );
        shellExec(
          `${baseCommand} deploy${clusterFlag}${cmdString} --replicas ${replicas} --disable-update-proxy ${deployId} ${env} --versions ${versions}${
            options.namespace ? ` --namespace ${options.namespace}` : ''
          }${timeoutFlags}${gitCleanFlag}`,
        );
        if (!targetTraffic)
          targetTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace });
        await Underpost.deploy.monitorReadyRunner(deployId, env, targetTraffic, [], options.namespace, 'underpost');
        Underpost.deploy.switchTraffic(deployId, env, targetTraffic, replicas, options.namespace, options);
      } else
        logger.info('current traffic', Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace }));
    },

    /**
     * @method stop
     * @description Stops a deployment by deleting the corresponding Kubernetes deployment and service resources.
     * @param {string} path - The input value, identifier, or path for the operation (used to determine which traffic to stop).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    stop: async (path = '', options = DEFAULT_OPTION) => {
      let currentTraffic = Underpost.deploy.getCurrentTraffic(options.deployId, {
        namespace: options.namespace,
        hostTest: options.hosts,
      });
      const env = options.dev ? 'development' : 'production';

      if (!path.match('current')) currentTraffic === 'blue' ? (currentTraffic = 'green') : (currentTraffic = 'blue');
      const [_deployId] = path.split(',');
      const deploymentId = `${_deployId ? _deployId : options.deployId}${
        options.instanceId ? `-${options.instanceId}` : ''
      }-${env}-${currentTraffic}`;

      shellExec(`kubectl delete deployment ${deploymentId} -n ${options.namespace}`);
      shellExec(`kubectl delete svc ${deploymentId}-service -n ${options.namespace}`);
    },

    /**
     * @method ssh-deploy-stop
     * @description Stops a remote deployment via SSH by executing the appropriate Underpost command on the remote server.
     * @param {string} path - The input value, identifier, or path for the operation (used to determine which traffic to stop).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy-stop': async (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';

      const remoteCommand = [
        `${baseCommand} run${baseClusterCommand} stop${path ? ` ${path}` : ''}`,
        ` --deploy-id ${options.deployId}${options.instanceId ? ` --instance-id ${options.instanceId}` : ''}`,
        ` --namespace ${options.namespace}${options.hosts ? ` --hosts ${options.hosts}` : ''}`,
      ].join('');

      await Underpost.ssh.sshRemoteRunner(remoteCommand, {
        deployId: options.deployId,
        user: options.user,
        dev: options.dev,
        remote: true,
        useSudo: true,
        cd: '/home/dd/engine',
      });
    },

    /**
     * @method ssh-deploy-db-rollback
     * @description Performs a database rollback on remote deployment via SSH.
     * @param {string} path - Comma-separated deployId and optional number of commits to reset (format: "deployId,nCommits")
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @param {string} options.deployId - The deployment identifier
     * @param {string} options.user - The SSH user for credential lookup
     * @param {boolean} options.dev - Development mode flag
     * @memberof UnderpostRun
     */
    'ssh-deploy-db-rollback': async (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      let [deployId, nCommitsReset] = path.split(',');
      if (!nCommitsReset) nCommitsReset = 1;

      const remoteCommand = `${baseCommand} db ${deployId} --git --kubeadm --primary-pod --force-clone --macro-rollback-export ${nCommitsReset}${options.namespace ? ` --ns ${options.namespace}` : ''}`;

      await Underpost.ssh.sshRemoteRunner(remoteCommand, {
        deployId: options.deployId,
        user: options.user,
        dev: options.dev,
        remote: true,
        useSudo: true,
        cd: '/home/dd/engine',
      });
    },

    /**
     * @method ssh-deploy-db
     * @description Imports/restores a database on remote deployment via SSH.
     * @param {string} path - The deployment ID for database import
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @param {string} options.deployId - The deployment identifier
     * @param {string} options.user - The SSH user for credential lookup
     * @param {boolean} options.dev - Development mode flag
     * @memberof UnderpostRun
     */
    'ssh-deploy-db': async (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';

      const remoteCommand = `${baseCommand} db ${path} --import --drop --preserveUUID --git --kubeadm --primary-pod --force-clone${options.namespace ? ` --ns ${options.namespace}` : ''}`;

      await Underpost.ssh.sshRemoteRunner(remoteCommand, {
        deployId: options.deployId,
        user: options.user,
        dev: options.dev,
        remote: true,
        useSudo: true,
        cd: '/home/dd/engine',
      });
    },

    /**
     * @method ssh-deploy-db-status
     * @description Retrieves database status/stats for a deployment (or all deployments from dd.router) via SSH.
     * @param {string} path - Comma-separated deployId(s) or 'dd' to use the dd.router list.
     * @param {Object} options - Runner options (uses options.deployId for SSH host lookup).
     * @param {string} options.deployId - Deployment identifier used for SSH config lookup.
     * @param {string} options.user - SSH user for credential lookup.
     * @param {boolean} options.dev - Development mode flag.
     * @param {string} [options.namespace] - Kubernetes namespace to pass to the db check.
     * @memberof UnderpostRun
     */
    'ssh-deploy-db-status': async (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';

      let deployList = [];
      if (!path || path === 'dd') {
        if (!fs.existsSync('./engine-private/deploy/dd.router')) {
          logger.warn('dd.router not found; nothing to run');
          return;
        }
        deployList = fs
          .readFileSync('./engine-private/deploy/dd.router', 'utf8')
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
      } else {
        deployList = path
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
      }

      for (const deployId of deployList) {
        const remoteCommand = `${baseCommand} db ${deployId} --stats --kubeadm --primary-pod${options.namespace ? ` --ns ${options.namespace}` : ''}`;

        await Underpost.ssh.sshRemoteRunner(remoteCommand, {
          deployId: options.deployId,
          user: options.user,
          dev: options.dev,
          remote: true,
          useSudo: true,
          cd: '/home/dd/engine',
        });
      }
    },

    /**
     * @method tz
     * @description Sets the system timezone using `timedatectl set-timezone` command.
     * @param {string} path - The input value, identifier, or path for the operation (used as the timezone string).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    tz: (path, options = DEFAULT_OPTION) => {
      const tz =
        options.timezone && options.timezone !== 'none'
          ? options.timezone
          : path
            ? path
            : Underpost.env.get('TIME_ZONE', undefined, { disableLog: true })
              ? Underpost.env.get('TIME_ZONE')
              : process.env.TIME_ZONE
                ? process.env.TIME_ZONE
                : 'America/New_York';
      shellExec(`sudo timedatectl set-timezone ${tz}`);
    },

    /**
     * @method get-proxy
     * @description Retrieves and logs the HTTPProxy resources in the specified namespace using `kubectl get HTTPProxy`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional filter for the HTTPProxy resources).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'get-proxy': async (path = '', options = DEFAULT_OPTION) => {
      console.log(
        shellExec(`kubectl get HTTPProxy -n ${options.namespace} ${path} -o yaml`, {
          silent: true,
          stdout: true,
        })
          .replaceAll(`blue`, `blue`.bgBlue.bold.black)
          .replaceAll('green', 'green'.bgGreen.bold.black)
          .replaceAll('Error', 'Error'.bold.red)
          .replaceAll('error', 'error'.bold.red)
          .replaceAll('ERROR', 'ERROR'.bold.red)
          .replaceAll('Invalid', 'Invalid'.bold.red)
          .replaceAll('invalid', 'invalid'.bold.red)
          .replaceAll('INVALID', 'INVALID'.bold.red),
      );
    },

    'instance-promote': async (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      let [deployId, id] = path.split(',');
      const confInstances = JSON.parse(
        fs.readFileSync(`./engine-private/conf/${deployId}/conf.instances.json`, 'utf8'),
      );
      let promotedTraffic = '';
      for (const instance of confInstances) {
        let {
          id: _id,
          host: _host,
          path: _path,
          image: _image,
          fromPort: _fromPort,
          toPort: _toPort,
          fromDebugPort: _fromDebugPort,
          toDebugPort: _toDebugPort,
          cmd: _cmd,
          volumes: _volumes,
          metadata: _metadata,
        } = instance;
        if (id !== _id) continue;
        const _deployId = `${deployId}-${_id}`;
        // Use debug ports in development when defined, fall back to production ports.
        if (env === 'development' && _fromDebugPort) _fromPort = _fromDebugPort;
        if (env === 'development' && _toDebugPort) _toPort = _toDebugPort;
        const currentTraffic = Underpost.deploy.getCurrentTraffic(_deployId, {
          hostTest: _host,
          namespace: options.namespace,
        });
        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
        promotedTraffic = targetTraffic;
        let proxyYaml =
          Underpost.deploy.baseProxyYamlFactory({ host: _host, env: options.tls ? 'production' : env, options }) +
          Underpost.deploy.deploymentYamlServiceFactory({
            path: _path,
            port: _fromPort,
            // serviceId: deployId,
            deployId: _deployId,
            env,
            deploymentVersions: [targetTraffic],
            // pathRewritePolicy,
          });
        if (options.tls) {
          shellExec(`sudo kubectl delete Certificate ${_host} -n ${options.namespace} --ignore-not-found`);
          proxyYaml += Underpost.deploy.buildCertManagerCertificate({ ...options, host: _host });
        }
        // console.log(proxyYaml);
        shellExec(`kubectl delete HTTPProxy ${_host} --namespace ${options.namespace} --ignore-not-found`);
        shellExec(
          `kubectl apply -f - -n ${options.namespace} <<EOF
${proxyYaml}
EOF
`,
          { disableLog: true },
        );
      }
      // Refresh the gRPC service to ensure it points to the parent deploy's current traffic.
      if (promotedTraffic) {
        const parentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace }) || 'blue';
        const grpcServicePath = Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer: loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
          namespace: options.namespace,
          traffic: [parentTraffic],
        });
        if (grpcServicePath) shellExec(`kubectl apply -f ${grpcServicePath} -n ${options.namespace}`);
      }
    },

    /**
     * @method instance
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string containing workflow parameters).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    instance: async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      let [deployId, id, replicas] = path.split(',');
      if (!replicas) replicas = options.replicas;
      const confInstances = JSON.parse(
        fs.readFileSync(`./engine-private/conf/${deployId}/conf.instances.json`, 'utf8'),
      );
      const etcHosts = [];
      for (const instance of confInstances) {
        let {
          id: _id,
          host: _host,
          path: _path,
          image: _image,
          fromPort: _fromPort,
          toPort: _toPort,
          fromDebugPort: _fromDebugPort,
          toDebugPort: _toDebugPort,
          cmd: _cmd,
          volumes: _volumes,
          metadata: _metadata,
        } = instance;
        if (id !== _id) continue;
        const _deployId = `${deployId}-${_id}`;
        // Use debug ports in development when defined, fall back to production ports.
        if (env === 'development' && _fromDebugPort) _fromPort = _fromDebugPort;
        if (env === 'development' && _toDebugPort) _toPort = _toDebugPort;
        etcHosts.push(_host);
        if (options.expose) continue;
        // Examples images:
        // `underpost/underpost-engine:${Underpost.version}`
        // `localhost/rockylinux9-underpost:${Underpost.version}`
        if (!_image) _image = `underpost/underpost-engine:${Underpost.version}`;

        if (_image && !_image.startsWith('localhost'))
          Underpost.image.pullDockerHubImage({
            dockerhubImage: _image,
            kind: options.kind || (!options.nodeName && !options.kubeadm && !options.k3s),
            kubeadm: options.nodeName || options.kubeadm,
            k3s: options.k3s,
          });

        const currentTraffic = Underpost.deploy.getCurrentTraffic(_deployId, {
          hostTest: _host,
          namespace: options.namespace,
        });

        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
        const podId = `${_deployId}-${env}-${targetTraffic}`;
        const ignorePods = Underpost.kubectl.get(podId, 'pods', options.namespace).map((p) => p.NAME);
        Underpost.deploy.configMap(env, options.namespace);
        shellExec(`kubectl delete service ${podId}-service --namespace ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl delete deployment ${podId} --namespace ${options.namespace} --ignore-not-found`);
        for (const _volume of _volumes)
          if (_volume.claimName)
            Underpost.deploy.deployVolume(_volume, {
              namespace: options.namespace,
              deployId: _deployId,
              env,
              version: targetTraffic,
              nodeName: options.nodeName,
              clusterContext: options.k3s ? 'k3s' : options.kubeadm ? 'kubeadm' : 'kind',
              gitClean: options.gitClean || false,
            });
        // Regenerate the parent deploy's gRPC ClusterIP service pointing to the
        // parent's current traffic colour and apply it before the instance pod starts so
        // DNS is resolvable the moment the pod boots.
        const parentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace }) || 'blue';
        const grpcServicePath = Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer: loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
          namespace: options.namespace,
          traffic: [targetTraffic],
          host: _host,
        });
        if (grpcServicePath) shellExec(`kubectl apply -f ${grpcServicePath} -n ${options.namespace}`);

        const resolvedCmd = _cmd[env].map((c) =>
          c.replaceAll(
            '{{grpc-service-dns}}',
            `${deployId}-grpc-service-${env}-${parentTraffic}.${options.namespace || 'default'}.svc.cluster.local:50051`,
          ),
        );

        let deploymentYaml = `---
${Underpost.deploy
  .deploymentYamlPartsFactory({
    deployId: _deployId,
    env,
    suffix: targetTraffic,
    resources: Underpost.deploy.resourcesFactory(options),
    replicas,
    image: _image,
    namespace: options.namespace,
    volumes: _volumes,
    cmd: resolvedCmd,
  })
  .replace('{{ports}}', buildKindPorts(_fromPort, _toPort))}
`;
        // console.log(deploymentYaml);
        shellExec(
          `kubectl apply -f - -n ${options.namespace} <<EOF
${deploymentYaml}
EOF
`,
          { disableLog: true },
        );
        const { ready, readyPods } = await Underpost.deploy.monitorReadyRunner(
          _deployId,
          env,
          targetTraffic,
          ignorePods,
          options.namespace,
        );

        if (!ready) {
          logger.error(`Deployment ${deployId} did not become ready in time.`);
          return;
        }
        shellExec(
          `${baseCommand} run${baseClusterCommand} --namespace ${options.namespace}` +
            `${options.nodeName ? ` --node-name ${options.nodeName}` : ''}` +
            `${options.tls ? ` --tls` : ''}` +
            ` instance-promote '${path}'`,
        );
      }
      if (options.etcHosts) {
        const hostListenResult = Underpost.deploy.etcHostFactory(etcHosts);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method instance-build-manifest
     * @description Builds a Kubernetes Deployment + Service manifest for a specific instance entry
     * from `conf.instances.json` and writes it to a file.
     * Traffic colour is automatically chosen as the opposite of the current live colour (blue/green),
     * defaulting to `blue` when no deployment is running yet.
     *
     * If `--build` is supplied the image is built from the project Dockerfile and loaded into the
     * cluster before the manifest is written (kind by default; `--kubeadm` / `--k3s` override).
     *
     * @param {string} path - Comma-separated: `deployId,instanceId[,projectPath]`.
     *   `projectPath` is the root directory that contains the `Dockerfile` (e.g. `./cyberia-client`).
     *   Artifacts are written to `<projectPath>/manifests/<env>/Dockerfile` and
     *   `<projectPath>/manifests/<env>/deployment.yaml`.
     *   In production, files are also copied to `<projectPath>/Dockerfile` and
     *   `<projectPath>/deployment.yaml`.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'instance-build-manifest': (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      let [deployId, id, projectPath] = path.split(',');
      const rootPath = projectPath ? projectPath : '.';
      const envManifestPath = `${rootPath}/manifests/deployments/${id}-${env}`;
      const outputPath = `${envManifestPath}/deployment.yaml`;
      const dockerfileManifestPath = `${envManifestPath}/Dockerfile`;

      fs.mkdirpSync(envManifestPath);

      const confInstances = JSON.parse(
        fs.readFileSync(`./engine-private/conf/${deployId}/conf.instances.json`, 'utf8'),
      );

      const instance = confInstances.find((i) => i.id === id);
      if (!instance) {
        logger.error(`Instance with id '${id}' not found in conf.instances.json for deployId '${deployId}'`);
        return;
      }

      let {
        id: _id,
        host: _host,
        path: _path,
        image: _image,
        fromPort: _fromPort,
        toPort: _toPort,
        fromDebugPort: _fromDebugPort,
        toDebugPort: _toDebugPort,
        cmd: _cmd,
        volumes: _volumes,
        metadata: _metadata,
        runtime: _runtime,
      } = instance;

      // Resolve Dockerfile source: use runtime-specific path when instance defines a runtime.
      const dockerfileSourcePath = _runtime ? `src/runtime/${_runtime}/Dockerfile` : `${rootPath}/Dockerfile`;
      if (fs.existsSync(dockerfileSourcePath)) {
        fs.copyFileSync(dockerfileSourcePath, dockerfileManifestPath);
      } else {
        logger.warn(`[instance-build-manifest] Dockerfile not found at ${dockerfileSourcePath}`);
      }

      const _deployId = `${deployId}-${_id}`;
      if (!_image) _image = `underpost/underpost-engine:${Underpost.version}`;
      // Use debug ports in development when defined, fall back to production ports.
      if (env === 'development' && _fromDebugPort) _fromPort = _fromDebugPort;
      if (env === 'development' && _toDebugPort) _toPort = _toDebugPort;

      // Build image from projectPath Dockerfile and load into cluster when --build is set.
      if (options.build && projectPath) {
        const isKind = !options.kubeadm && !options.k3s;
        Underpost.image.build({
          path: projectPath,
          imageName: _image,
          podmanSave: true,
          imagePath: projectPath,
          kind: isKind,
          kubeadm: !!options.kubeadm,
          k3s: !!options.k3s,
          reset: !!options.reset,
          dev: options.dev,
        });
        logger.info(`[instance-build-manifest] Image built and loaded`, {
          image: _image,
          cluster: isKind ? 'kind' : options.kubeadm ? 'kubeadm' : 'k3s',
        });
      }

      // Determine target traffic: opposite of current, or 'blue' if nothing is running yet.
      const currentTraffic = Underpost.deploy.getCurrentTraffic(_deployId, {
        hostTest: _host,
        namespace: options.namespace,
      });
      const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';

      // Resolve {{grpc-service-dns}} using the parent deploy's current (or default) traffic.
      const parentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace }) || 'blue';
      const resolvedCmd = _cmd[env].map((c) =>
        c.replaceAll(
          '{{grpc-service-dns}}',
          `${deployId}-grpc-service-${env}-${parentTraffic}.${options.namespace || 'default'}.svc.cluster.local:50051`,
        ),
      );

      const deploymentYaml =
        `---\n` +
        Underpost.deploy
          .deploymentYamlPartsFactory({
            deployId: _deployId,
            env,
            suffix: targetTraffic,
            resources: Underpost.deploy.resourcesFactory(options),
            replicas: options.replicas,
            image: _image,
            namespace: options.namespace,
            volumes: _volumes,
            cmd: resolvedCmd,
          })
          .replace('{{ports}}', buildKindPorts(_fromPort, _toPort));

      fs.writeFileSync(outputPath, deploymentYaml, 'utf8');
      logger.info(`[instance-build-manifest] Manifest written to ${outputPath}`, {
        deployId: _deployId,
        env,
        traffic: targetTraffic,
        image: _image,
      });

      if (env === 'production') {
        if (fs.existsSync(dockerfileManifestPath)) {
          fs.copyFileSync(dockerfileManifestPath, `${rootPath}/Dockerfile`);
        }
        fs.copyFileSync(outputPath, `${rootPath}/deployment.yaml`);
        logger.info('[instance-build-manifest] Production artifacts copied to project root', {
          rootPath,
          dockerfile: `${rootPath}/Dockerfile`,
          deployment: `${rootPath}/deployment.yaml`,
        });
        const ciSrc = `./.github/workflows/docker-image.${_runtime}.ci.yml`;
        if (fs.existsSync(ciSrc)) {
          if (!fs.existsSync(`${rootPath}/.github/workflows`)) fs.mkdirpSync(`${rootPath}/.github/workflows`);
          fs.copyFileSync(ciSrc, `${rootPath}/.github/workflows/docker-image.${_runtime}.ci.yml`);
          logger.info(`[instance-build-manifest] CI workflow copied`, { src: ciSrc });
        }
      }
    },

    /**
     * @method ls-deployments
     * @description Retrieves and logs a table of Kubernetes deployments using `Underpost.deploy.get`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional deployment name filter).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = DEFAULT_OPTION) => {
      console.table(await Underpost.kubectl.get(path, 'deployments', options.namespace));
    },

    /**
     * @method host-update
     * @description Executes the `rocky-setup.sh` script to update the host system configuration.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'host-update': async (path, options = DEFAULT_OPTION) => {
      // const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`chmod +x ${options.underpostRoot}/scripts/rocky-setup.sh`);
      shellExec(`${options.underpostRoot}/scripts/rocky-setup.sh${options.dev ? ' --install-dev' : ``}`);
    },

    /**
     * @method dd-container
     * @description Deploys a development or debug container tasks jobs, setting up necessary volumes and images, and running specified commands within the container.
     * @param {string} path - The input value, identifier, or path for the operation (used as the command to run inside the container).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dd-container': async (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const currentImage = options.imageName
        ? options.imageName
        : Underpost.deploy
            .getCurrentLoadedImages(options.nodeName ? options.nodeName : 'kind-worker', false)
            .find((o) => o.IMAGE.match('underpost'));
      const podName = options.podName || `underpost-dev-container`;
      const volumeHostPath = options.claimName || '/home/dd';
      const claimName = options.claimName || `pvc-dd`;

      if (!options.nodeName) {
        shellExec(`docker exec -i kind-worker bash -c "rm -rf ${volumeHostPath}"`);
        shellExec(`docker exec -i kind-worker bash -c "mkdir -p ${volumeHostPath}"`);
        shellExec(`docker cp ${volumeHostPath}/engine kind-worker:${volumeHostPath}/engine`);
        shellExec(
          `docker exec -i kind-worker bash -c "chown -R 1000:1000 ${volumeHostPath}; chmod -R 755 ${volumeHostPath}"`,
        );
      } else {
        shellExec(`kubectl apply -f ${options.underpostRoot}/manifests/pv-pvc-dd.yaml -n ${options.namespace}`);
      }

      if (!currentImage)
        shellExec(`${baseCommand} image${baseClusterCommand} --pull-base ${options.dev ? '--kind' : '--kubeadm'}`);
      // shellExec(`kubectl delete pod ${podName} --ignore-not-found`);

      const payload = {
        ...options,
        podName,
        imageName: currentImage
          ? currentImage.image
            ? currentImage.image
            : currentImage.IMAGE
              ? `${currentImage.IMAGE}:${currentImage.TAG}`
              : `localhost/rockylinux9-underpost:${Underpost.version}`
          : `localhost/rockylinux9-underpost:${Underpost.version}`,
        volumeMountPath: volumeHostPath,
        ...(options.dev ? { volumeHostPath } : { claimName }),
        on: {
          init: async () => {},
        },
        args: [daemonProcess(path ? path : `cd /home/dd/engine && npm install && npm run test`)],
      };

      await Underpost.run.CALL('deploy-job', path, payload);
    },

    /**
     * @method ip-info
     * @description Executes the `ip-info.sh` script to display IP-related information for the specified path.
     * @param {string} path - The input value, identifier, or path for the operation (used as an argument to the script).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ip-info': (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/ip-info.sh`);
      shellExec(`${underpostRoot}/scripts/ip-info.sh ${path}`);
    },

    /**
     * @method db-client
     * @description Deploys and exposes the Adminer database client application (using `adminer:4.7.6-standalone` image) on the cluster.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'db-client': async (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;

      Underpost.image.pullDockerHubImage({
        dockerhubImage: 'adminer',
        version: '4.7.6-standalone',
        kind: options.kind,
        kubeadm: options.kubeadm,
        k3s: options.k3s,
      });

      shellExec(`kubectl delete deployment adminer -n ${options.namespace} --ignore-not-found`);
      shellExec(`kubectl apply -k ${underpostRoot}/manifests/deployment/adminer/. -n ${options.namespace}`);
      const successInstance = await Underpost.test.statusMonitor('adminer', 'Running', 'pods', 1000, 60 * 10);

      if (successInstance) {
        shellExec(`underpost deploy --expose adminer --namespace ${options.namespace}`);
      }
    },

    /**
     * @method git-conf
     * @description Configures Git global and local user name and email settings based on the provided `path` (formatted as `username,email`), or defaults to environment variables.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string: `username,email`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'git-conf': (path = '', options = DEFAULT_OPTION) => {
      const defaultUsername = Underpost.env.get('GITHUB_USERNAME');
      const defaultEmail = Underpost.env.get('GITHUB_EMAIL');
      const validPath = path && path.split(',').length;
      const [username, email] = validPath ? path.split(',') : [defaultUsername, defaultEmail];
      if (validPath) {
        Underpost.env.set('GITHUB_USERNAME', username);
        Underpost.env.set('GITHUB_EMAIL', email);
        Underpost.env.get('GITHUB_USERNAME');
        Underpost.env.get('GITHUB_EMAIL');
      }
      shellExec(
        `git config --global credential.helper "" && ` +
          `git config credential.helper "" && ` +
          `git config --global user.name '${username}' && ` +
          `git config --global user.email '${email}' && ` +
          `git config --global credential.interactive always && ` +
          `git config user.name '${username}' && ` +
          `git config user.email '${email}' && ` +
          `git config credential.interactive always &&` +
          `git config pull.rebase false`,
        {
          disableLog: true,
          silent: true,
        },
      );

      if (options.logs)
        console.log(
          shellExec(`git config list`, { silent: true, stdout: true })
            .replaceAll('user.email', 'user.email'.yellow)
            .replaceAll(username, username.green)
            .replaceAll('user.name', 'user.name'.yellow)
            .replaceAll(email, email.green),
        );
    },

    /**
     * @method promote
     * @description Switches traffic between blue/green deployments for a specified deployment ID(s) (uses `dd.router` for 'dd', or a specific ID).
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string: `deployId,env,replicas`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    promote: async (path, options = DEFAULT_OPTION) => {
      let [inputDeployId, inputEnv, inputReplicas] = path.split(',');
      if (!inputEnv) inputEnv = 'production';
      if (!inputReplicas) inputReplicas = 1;
      if (inputDeployId === 'dd') {
        for (const deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
          const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace });
          const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
          Underpost.deploy.switchTraffic(deployId, inputEnv, targetTraffic, inputReplicas, options.namespace, options);
        }
      } else {
        const currentTraffic = Underpost.deploy.getCurrentTraffic(inputDeployId, { namespace: options.namespace });
        const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
        Underpost.deploy.switchTraffic(
          inputDeployId,
          inputEnv,
          targetTraffic,
          inputReplicas,
          options.namespace,
          options,
        );
      }
    },
    /**
     * @method metrics
     * @description Deploys Prometheus and Grafana for metrics monitoring, targeting the hosts defined in the deployment configuration files.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    metrics: async (path, options = DEFAULT_OPTION) => {
      const deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',');
      let hosts = [];
      for (const deployId of deployList) {
        const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
        hosts = hosts.concat(Object.keys(confServer));
      }
      shellExec(`node bin cluster --prom ${hosts.join(',')}`);
      shellExec(`node bin cluster --grafana`);
    },
    /**
     * @method cluster
     * @description Deploys a full production/development ready Kubernetes cluster environment including MongoDB, MariaDB, Valkey, Contour (Ingress), and Cert-Manager, and deploys all services.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    cluster: async (path = '', options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const clusterType = options.k3s ? 'k3s' : 'kubeadm';
      shellCd(`/home/dd/engine`);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --reset --${clusterType}`);
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType}`);
      await timer(5000);
      let [runtimeImage, deployList] =
        path && path.trim() && path.split(',')
          ? path.split(',')
          : [
              'express',
              fs.readFileSync(`${underpostRoot}/engine-private/deploy/dd.router`, 'utf8').replaceAll(',', '+'),
            ];
      shellExec(
        `${baseCommand} image${baseClusterCommand} --build ${
          runtimeImage ? ` --pull-base --path ${underpostRoot}/src/runtime/${runtimeImage}` : ''
        } --${clusterType}`,
      );
      if (!deployList) {
        deployList = [];
        logger.warn('No deploy list provided');
      } else deployList = deployList.split('+');
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --mongodb`);
      if (runtimeImage === 'lampp') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --mariadb`);
      }
      await timer(5000);
      for (const deployId of deployList) {
        shellExec(
          `${baseCommand} db ${deployId} --import --git --drop --preserveUUID --primary-pod${options.namespace ? ` --ns ${options.namespace}` : ''}`,
        );
      }
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --valkey`);
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --contour`);
      if (env === 'production') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --cert-manager`);
      }
      for (const deployId of deployList) {
        shellExec(
          `${baseCommand} deploy ${deployId} ${env} --${clusterType}${env === 'production' ? ' --cert' : ''}${
            env === 'development' ? ' --etc-hosts' : ''
          }${options.namespace ? ` --namespace ${options.namespace}` : ''}`,
        );
      }
    },
    /**
     * @method deploy
     * @description Deploys a specified service (identified by `path`) using blue/green strategy, monitors its status, and switches traffic upon readiness.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID to deploy).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    deploy: async (path, options = DEFAULT_OPTION) => {
      const deployId = path;
      const { validVersion } = Underpost.repo.privateConfUpdate(deployId);
      if (!validVersion) throw new Error('Version mismatch');
      const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace });
      const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
      const env = options.dev ? 'development' : 'production';
      const ignorePods = Underpost.deploy
        .get(`${deployId}-${env}-${targetTraffic}`, 'pods', options.namespace)
        .map((p) => p.NAME);

      shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${targetTraffic} -n ${options.namespace}`);

      await Underpost.deploy.monitorReadyRunner(
        deployId,
        env,
        targetTraffic,
        ignorePods,
        options.namespace,
        'underpost',
      );

      Underpost.deploy.switchTraffic(deployId, env, targetTraffic, options.replicas, options.namespace, options);
    },

    /**
     * @method disk-clean
     * @description Executes the `disk-clean-sh` script to perform disk cleanup operations.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-clean': async (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/disk-clean.sh`);
      shellExec(`./scripts/disk-clean.sh`);
    },

    /**
     * @method disk-devices
     * @description Executes the `disk-devices.sh` script to display information about disk devices.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-devices': async (path = '/', options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/disk-devices.sh`);
      shellExec(`${underpostRoot}/scripts/disk-devices.sh`);
    },

    /**
     * @method disk-usage
     * @description Displays disk usage statistics using the `du` command, sorted by size.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-usage': async (path = '/', options = DEFAULT_OPTION) => {
      if (!path) path = '/';
      logger.info('Mount filesystem');
      shellExec(`df -h${path === '/' ? '' : ` ${path}`}`);
      logger.info('Files disks usage');
      shellExec(`du -xh ${path} --max-depth=1 | sort -h`);
    },

    /**
     * @method dev
     * @description Starts development servers for client, API, and proxy based on provided parameters (deployId, host, path, clientHostPort).
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,subConf,host,path,clientHostPort`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    dev: async (path = '', options = DEFAULT_OPTION) => {
      let [deployId, subConf, host, _path, clientHostPort] = path.split(',');
      if (options.confServerPath) {
        const confServer = JSON.parse(fs.readFileSync(options.confServerPath, 'utf8'));
        fs.writeFileSync(
          `./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`,
          JSON.stringify(
            {
              [host]: {
                [_path]: confServer[host][_path],
              },
            },
            null,
            4,
          ),
          'utf8',
        );
      }
      if (!deployId) deployId = 'dd-default';
      if (!host) host = 'default.net';
      if (!_path) _path = '/';
      if (!clientHostPort) clientHostPort = 'localhost:4004';
      if (!subConf) subConf = 'local';
      if (options.reset && fs.existsSync(`./engine-private/conf/${deployId}`))
        fs.removeSync(`./engine-private/conf/${deployId}`);
      if (options.devProxyPortOffset) {
        const envPath = `./engine-private/conf/${deployId}/.env.development`;
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        envObj.DEV_PROXY_PORT_OFFSET = options.devProxyPortOffset;
        writeEnv(envPath, envObj);
      }
      dotenv.config({ path: `./engine-private/conf/${deployId}/.env.development`, override: true });
      shellExec(`node bin run dev-cluster --expose --namespace ${options.namespace}`, { async: true });
      {
        const cmd = `npm run dev:api ${deployId} ${subConf} ${host} ${_path} ${clientHostPort} proxy${
          options.tls ? ' tls' : ''
        }`;
        shellExec(cmd, { async: true });
      }
      await awaitDeployMonitor(true);
      {
        const cmd = `npm run dev:client ${deployId} ${subConf} ${host} ${_path} proxy${options.tls ? ' tls' : ''}`;

        shellExec(cmd, {
          async: true,
        });
      }
      await awaitDeployMonitor(true);
      shellExec(
        `NODE_ENV=development node src/proxy proxy ${deployId} ${subConf} ${host} ${_path}${options.tls ? ' tls' : ''}`,
      );
    },

    /**
     * @method service
     * @description Deploys and exposes specific services (like `mongo-express-service`) on the cluster, updating deployment configurations and monitoring status.
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,serviceId,host,path,replicas,image,node`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    service: async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      shellCd(`/home/dd/engine`);
      let [deployId, serviceId, host, _path, replicas, image, node] = path.split(',');
      if (!replicas) replicas = options.replicas;
      // const confClient = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.client.json`, 'utf8'));
      const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
      // const confSSR = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.ssr.json`, 'utf8'));
      // const packageData = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/package.json`, 'utf8'));
      const services = fs.existsSync(`./engine-private/deploy/${deployId}/conf.services.json`)
        ? JSON.parse(fs.readFileSync(`./engine-private/deploy/${deployId}/conf.services.json`, 'utf8'))
        : [];
      let serviceData = services.findIndex((s) => s.serviceId === serviceId);
      const payload = {
        serviceId,
        path: _path,
        port: options.port,
        host,
      };
      let podToMonitor;
      if (!payload.port)
        switch (serviceId) {
          case 'mongo-express-service': {
            payload.port = 8081;
            break;
          }
          case 'grafana': {
            payload.port = 3000;
            // payload.pathRewritePolicy = [
            //   {
            //     prefix: '/grafana',
            //     replacement: '/',
            //   },
            // ];
            break;
          }
        }
      if (serviceData == -1) {
        services.push(payload);
      } else {
        services[serviceData] = payload;
      }
      fs.writeFileSync(
        `./engine-private/conf/${deployId}/conf.services.json`,
        JSON.stringify(services, null, 4),
        'utf8',
      );
      switch (serviceId) {
        case 'mongo-express-service': {
          shellExec(`kubectl delete svc mongo-express-service -n ${options.namespace} --ignore-not-found`);
          shellExec(`kubectl delete deployment mongo-express -n ${options.namespace} --ignore-not-found`);
          shellExec(`kubectl apply -f manifests/deployment/mongo-express/deployment.yaml -n ${options.namespace}`);
          podToMonitor = 'mongo-express';
          break;
        }
        case 'grafana': {
          shellExec(
            `node bin cluster${baseClusterCommand} --grafana --hosts '${host}' --prom '${Object.keys(confServer)}'`,
          );
          podToMonitor = 'grafana';
          break;
        }
      }
      const success = await Underpost.test.statusMonitor(podToMonitor);
      if (success) {
        const versions = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace }) || 'blue';
        if (!node) node = os.hostname();
        const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${
            options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''
          } --build-manifest --sync --info-router --replicas ${replicas} --node ${node}${
            image ? ` --image ${image}` : ''
          }${versions ? ` --versions ${versions}` : ''}${timeoutFlags} dd ${env}`,
        );
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${
            options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''
          } --disable-update-deployment ${deployId} ${env} --versions ${versions}`,
        );
      } else logger.error(`Service pod ${podToMonitor} failed to start in time.`);
      if (options.etcHosts === true) {
        const hostListenResult = Underpost.deploy.etcHostFactory([host]);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method etc-hosts
     * @description Generates and logs the contents for the `/etc/hosts` file based on provided hosts or deployment configurations.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated list of hosts).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'etc-hosts': async (path = '', options = DEFAULT_OPTION) => {
      const hosts = path ? path.split(',') : [];
      if (options.deployId) {
        const confServer = loadConfServerJson(`./engine-private/conf/${options.deployId}/conf.server.json`);
        hosts.push(...Object.keys(confServer));
      }
      const hostListenResult = Underpost.deploy.etcHostFactory(hosts);
      logger.info(hostListenResult.renderHosts);
    },

    /**
     * @method sh
     * @description Enables remote control for the Kitty terminal emulator.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sh: async (path = '', options = DEFAULT_OPTION) => {
      let [operator, arg0, arg1] = path.split(',');
      if (operator == 'copy') {
        shellExec(
          `kitty @ get-text ${arg0 === 'all' ? '--match all' : '--self'} --extent all${
            arg1 === 'ansi' ? ' --ansi yes' : ''
          } | kitty +kitten clipboard`,
        );
        return;
      }
      shellExec(`kitty -o allow_remote_control=yes`);
    },

    /**
     * @method log
     * @description Searches and highlights keywords in a specified log file, optionally showing surrounding lines.
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `filePath,keywords,lines`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    log: async (path, options = DEFAULT_OPTION) => {
      const [filePath, keywords, lines] = path.split(',');
      let result = shellExec(`grep -i -E ${lines ? `-C ${lines} ` : ''}'${keywords}' ${filePath}`, {
        stdout: true,
        silent: true,
      }).replaceAll(`--`, `==============================`.green.bold);
      for (const keyword of keywords.split('|')) result = result.replaceAll(keyword, keyword.bgYellow.black.bold);
      console.log(result);
    },

    /**
     * @method ps
     * @description Displays running processes that match a specified path or keyword.
     * @param {string} path - The input value, identifier, or path for the operation (used as a keyword to filter processes).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ps: async (path = '', options = DEFAULT_OPTION) => {
      const out = shellExec(
        path.startsWith('top-consumers')
          ? `ps -eo pid,%cpu,%mem,rss,cmd --sort=-%cpu | head -n ${path.split(',')[1] || 15}`
          : path
            ? `(ps -eo pid,%cpu,%mem,rss,cmd -ww | head -n1; ps -eo pid,%cpu,%mem,rss,cmd -ww | tail -n +2 | grep -F ${path})`
            : `ps -eo pid,%cpu,%mem,rss,cmd -ww`,
        {
          stdout: true,
          silent: true,
        },
      );

      console.log(
        path ? out.replaceAll(path.split(',')[2] || path, (path.split(',')[2] || path).bgYellow.black.bold) : out,
      );
    },

    /**
     * @method pid-info
     * @description Displays detailed information about a process by PID, including service details, command line, executable path, working directory, environment variables, and parent process tree.
     * @param {string} path - The PID of the process to inspect.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'pid-info': (path, options = DEFAULT_OPTION) => {
      const pid = path;
      if (!pid) {
        logger.error('PID is required. Usage: underpost run pid-info <pid>');
        return;
      }

      // Services
      logger.info('Process info');
      shellExec(`sudo ps -p ${pid} -o pid,ppid,user,stime,etime,cmd`);
      logger.info('Command line');
      shellExec(`sudo cat /proc/${pid}/cmdline | tr '\\0' ' ' ; echo`);
      logger.info('Executable path');
      shellExec(`sudo readlink -f /proc/${pid}/exe`);
      logger.info('Working directory');
      shellExec(`sudo readlink -f /proc/${pid}/cwd`);
      logger.info('Environment variables (first 200)');
      shellExec(`sudo tr '\\0' '\\n' </proc/${pid}/environ | head -200`);

      // Parent
      logger.info('Parent process');
      const parentInfo = shellExec(`sudo ps -o pid,ppid,user,cmd -p ${pid}`, { stdout: true, silent: true });
      console.log(parentInfo);
      const ppidMatch = parentInfo.split('\n').find((l) => l.trim().startsWith(pid));
      if (ppidMatch) {
        const ppid = ppidMatch.trim().split(/\s+/)[1];
        logger.info(`Parent PID: ${ppid}`);
        shellExec(`ps -fp ${ppid}`);
      }
      logger.info('Process tree');
      shellExec(`pstree -s ${pid}`);
    },

    /**
     * @method background
     * @description Runs a custom command in the background using nohup, logging output to `/var/log/<id>.log` and saving the PID to `/var/run/<id>.pid`.
     * @param {string} path - The command to run in the background (e.g. 'npm run prod:container dd-cyberia-r3').
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    background: (path, options = DEFAULT_OPTION) => {
      if (!path) {
        logger.error('Command is required. Usage: underpost run background <command>');
        return;
      }
      const id = path.split(/\s+/).pop();
      const logFile = `/var/log/${id}.log`;
      const pidFile = `/var/run/${id}.pid`;
      logger.info(`Starting background process`, { id, logFile, pidFile });
      shellExec(`nohup ${path} > ${logFile} 2>&1 & pid=$!; echo $pid > ${pidFile}; disown`);
      logger.info(`Background process started for '${id}'`);
    },

    /**
     * @method ports
     * @description Set on ~/.bashrc alias: ports <port> Command to list listening ports that match the given keyword.
     * @param {string} path - The input value, identifier, or path for the operation (used as a keyword to filter listening ports).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ports: async (path = '', options = DEFAULT_OPTION) => {
      shellExec(`chmod +x ${options.underpostRoot}/scripts/ports-ls.sh`);
      shellExec(`${options.underpostRoot}/scripts/ports-ls.sh`);
    },

    /**
     * @method deploy-test
     * @description Deploys a test deployment (`dd-test`) in either development or production mode, setting up necessary secrets and starting the deployment.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'deploy-test': async (path, options = DEFAULT_OPTION) => {
      // Note: use recomendation empty deploy cluster: node bin --dev cluster
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const inputs = path ? path.split(',') : [];
      const deployId = inputs[0] ? inputs[0] : 'dd-test';
      const cmd = options.cmd
        ? options.cmd
        : [
            `npm install -g npm@11.2.0`,
            `npm install -g underpost`,
            `${baseCommand} secret underpost --create-from-env`,
            `${baseCommand} start --build --run ${deployId} ${env}`,
          ];
      shellExec(`node bin run sync${baseClusterCommand} --deploy-id-cron-jobs none dd-test --cmd "${cmd}"`);
    },

    /**
     * @method tf-vae-test
     * @description Creates and runs a job pod (`tf-vae-test`) that installs TensorFlow dependencies, clones the TensorFlow docs, and runs the CVAE tutorial script, with a terminal monitor attached.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'tf-vae-test': async (path, options = DEFAULT_OPTION) => {
      const podName = 'tf-vae-test';
      await Underpost.run.CALL('deploy-job', '', {
        logs: options.logs,
        podName,
        // volumeMountPath: '/custom_images',
        // volumeHostPath: '/home/dd/engine/src/client/public/cyberia/assets/skin',
        on: {
          init: async () => {
            // const pid = getTerminalPid();
            // shellExec(`sudo kill -9 ${pid}`);
            (async () => {
              const nameSpace = options.namespace;
              const basePath = '/home/dd';
              const scriptPath = '/site/en/tutorials/generative/cvae.py';

              const { close } = await (async () => {
                const checkAwaitPath = '/await';
                while (!Underpost.kubectl.existsFile({ podName, path: checkAwaitPath })) {
                  logger.info('monitor', checkAwaitPath);
                  await timer(1000);
                }

                return {
                  close: () => shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf ${checkAwaitPath}"`),
                };
              })();

              const localScriptPath = `${basePath}/lab/src/${scriptPath.split('/').pop()}`;
              if (!fs.existsSync(localScriptPath)) {
                throw new Error(`Local override script not found: ${localScriptPath}`);
              }

              shellExec(`sudo kubectl cp ${localScriptPath} ${nameSpace}/${podName}:${basePath}/docs${scriptPath}`);

              close();

              {
                const checkPath = `/latent_space_plot.png`;
                const outsPaths = [];
                const labDir = `${basePath}/lab`;

                logger.info('monitor', checkPath);
                {
                  const checkAwaitPath = `/home/dd/docs${checkPath}`;
                  while (!Underpost.kubectl.existsFile({ podName, path: checkAwaitPath })) {
                    logger.info('waiting for', checkAwaitPath);
                    await timer(1000);
                  }
                }

                {
                  const toPath = `${labDir}${checkPath}`;
                  outsPaths.push(toPath);
                  shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${checkPath} ${toPath}`);
                }

                for (let i of range(1, 10)) {
                  const fileName = `image_at_epoch_${setPad(i, '0', 4)}.png`;
                  const fromPath = `/${fileName}`;
                  const toPath = `${labDir}/${fileName}`;
                  outsPaths.push(toPath);
                  shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${fromPath} ${toPath}`);
                }

                shellExec(`firefox ${outsPaths.join(' ')}`);
                process.exit(0);
              }
            })();
          },
        },
        args: [
          `pip install --upgrade \
               nbconvert \
               tensorflow-probability==0.23.0 \
               imageio \
               git+https://github.com/tensorflow/docs \
               matplotlib \
               "numpy<1.25,>=1.21"`,
          'mkdir -p /home/dd',
          'cd /home/dd',
          'git clone https://github.com/tensorflow/docs.git',
          'cd docs',
          'jupyter nbconvert --to python site/en/tutorials/generative/cvae.ipynb',
          `echo '' > /await`,
          `echo '=== WAITING SCRIPT LAUNCH ==='`,
          `while [ -f /await ]; do sleep 1; done`,
          `echo '=== FINISHED ==='`,
          daemonProcess(`ipython site/en/tutorials/generative/cvae.py`),
        ],
      });
    },

    /**
     * @method spark-template
     * @description Creates a new Spark template project using `sbt new` in `/home/dd/spark-template`, initializes a Git repository, and runs `replace_params.sh` and `build.sh`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'spark-template': (path, options = DEFAULT_OPTION) => {
      const dir = '/home/dd/spark-template';
      shellExec(`sudo rm -rf ${dir}`);
      shellCd('/home/dd');

      // pbcopy(`cd /home/dd && sbt new ${process.env.GITHUB_USERNAME}/spark-template.g8`);
      // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      shellExec(`cd /home/dd && sbt new ${process.env.GITHUB_USERNAME}/spark-template.g8 '--name=spark-template'`);

      shellCd(dir);

      Underpost.repo.initLocalRepo({ path: dir });
      shellExec(`git add . && git commit -m "Base implementation"`);
      shellExec(`chmod +x ./replace_params.sh`);
      shellExec(`chmod +x ./build.sh`);

      shellExec(`./replace_params.sh`);
      shellExec(`./build.sh`);

      shellCd('/home/dd/engine');
    },
    /**
     * @method pull-rocky-image
     * @description Pulls the base `rockylinux:9` image from Docker Hub via Podman.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'pull-rocky-image': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo podman pull docker.io/library/rockylinux:9`);
    },
    /**
     * @method rmi
     * @description Forces the removal of all local Podman images (`podman rmi $(podman images -qa) --force`).
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    rmi: (path, options = DEFAULT_OPTION) => {
      shellExec(`podman rmi $(podman images -qa) --force`);
    },
    /**
     * @method kill
     * @description Kills processes listening on the specified port(s). If the `path` contains a `+`, it treats it as a range of ports to kill.
     * @param {string} path - The input value, identifier, or path for the operation (used as the port number).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    kill: (path = '', options = DEFAULT_OPTION) => {
      if (options.pid) return shellExec(`sudo kill -9 ${options.pid}`);
      for (const _path of path.split(',')) {
        if (_path.split('+')[1]) {
          let [port, sumPortOffSet] = _path.split('+');
          port = parseInt(port);
          sumPortOffSet = parseInt(sumPortOffSet);
          for (const sumPort of range(0, sumPortOffSet))
            shellExec(`sudo kill -9 $(lsof -t -i:${parseInt(port) + parseInt(sumPort)})`);
        } else shellExec(`sudo kill -9 $(lsof -t -i:${_path})`);
      }
    },
    /**
     * @method secret
     * @description Creates an Underpost secret named 'underpost' from a file, defaulting to `/home/dd/engine/engine-private/conf/dd-cron/.env.production` if no path is provided.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional path to the secret file).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    /**
     * @method generate-pass
     * @description Generates a cryptographically secure random password that satisfies all validatePassword
     * constraints (lowercase, uppercase, digit, special char, min 8 chars). Logs the plain password
     * to the console or, when `--copy` is set, copies it to the clipboard via pbcopy.
     * @param {string} path - Optional password length (default: 16).
     * @param {Object} options - The default underpost runner options for customizing workflow.
     * @param {boolean} options.copy - When true, copies to clipboard instead of logging.
     * @memberof UnderpostRun
     */
    'generate-pass': (path, options = DEFAULT_OPTION) => {
      const length = path && parseInt(path) > 0 ? parseInt(path) : 16;
      const lower = 'abcdefghijklmnopqrstuvwxyz';
      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const digits = '0123456789';
      const special = '@#$%^&*()_+';
      const all = lower + upper + digits + special;
      const buf = crypto.randomBytes(length + 4);
      // Guarantee at least one character from each required class
      const chars = [
        lower[buf[0] % lower.length],
        upper[buf[1] % upper.length],
        digits[buf[2] % digits.length],
        special[buf[3] % special.length],
      ];
      for (let i = 4; i < length; i++) chars.push(all[buf[i] % all.length]);
      // Fisher-Yates shuffle using an independent random buffer
      const shuf = crypto.randomBytes(length);
      for (let i = chars.length - 1; i > 0; i--) {
        const j = shuf[i % shuf.length] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      const password = chars.join('');
      if (options.copy) pbcopy(password);
      else console.log(password);
    },

    secret: (path, options = DEFAULT_OPTION) => {
      const secretPath = path ? path : `/home/dd/engine/engine-private/conf/dd-cron/.env.production`;
      const command = `${options.dev ? 'node bin' : 'underpost'} secret underpost --create-from-file ${secretPath}`;
      shellExec(command);
    },
    /**
     * @method underpost-config
     * @description Calls `Underpost.deploy.configMap` to create a Kubernetes ConfigMap, defaulting to the 'production' environment.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional configuration name/environment).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'underpost-config': (path = '', options = DEFAULT_OPTION) => {
      Underpost.deploy.configMap(path ? path : 'production', options.namespace);
    },
    /**
     * @method gpu-env
     * @description Sets up a dedicated GPU development environment cluster, resetting and then setting up the cluster with `--dedicated-gpu` and monitoring the pods.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'gpu-env': (path, options = DEFAULT_OPTION) => {
      const clusterType = 'kubeadm';
      shellExec(
        `node bin cluster --dev --reset --${clusterType} && node bin cluster --dev --dedicated-gpu --${clusterType} && kubectl get pods --all-namespaces -o wide -w`,
      );
    },
    /**
     * @method tf-gpu-test
     * @description Deletes existing `tf-gpu-test-script` ConfigMap and `tf-gpu-test-pod`, and applies the test manifest from `manifests/deployment/tensorflow/tf-gpu-test.yaml`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'tf-gpu-test': (path, options = DEFAULT_OPTION) => {
      const { underpostRoot, namespace } = options;
      shellExec(`kubectl delete configmap tf-gpu-test-script -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pod tf-gpu-test-pod -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml -n ${namespace}`);
    },

    /**
     * @method deploy-job
     * @description Creates and applies a custom Kubernetes Pod manifest (Job) for running arbitrary commands inside a container image (defaulting to a TensorFlow/NVIDIA image).
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional script path or job argument).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'deploy-job': async (path, options = DEFAULT_OPTION) => {
      const podName = options.podName || 'deploy-job';
      const volumeName = `${podName}-volume`;
      if (typeof options.args === 'string') options.args = options.args.split(',');
      const args = (options.args ? options.args : path ? [path] : [`python ${path}`]).filter((c) => c.trim());
      const imageName = options.imageName || 'nvcr.io/nvidia/tensorflow:24.04-tf2-py3';
      const containerName = options.containerName || `${podName}-container`;
      const gpuEnable = imageName.match('nvidia');
      const runtimeClassName = options.runtimeClassName ? options.runtimeClassName : gpuEnable ? 'nvidia' : '';
      const namespace = options.namespace || 'default';
      const volumeMountPath = options.volumeMountPath || path;
      const volumeHostPath = options.volumeHostPath || path;
      const claimName = options.claimName || '';
      const enableVolumeMount = volumeMountPath && (volumeHostPath || claimName);
      const tty = options.tty ? 'true' : 'false';
      const stdin = options.stdin ? 'true' : 'false';
      const restartPolicy = options.restartPolicy || 'Never';
      const kindType = options.kindType || 'Pod';
      const imagePullPolicy = options.imagePullPolicy || 'IfNotPresent';
      const hostNetwork = options.hostNetwork ? options.hostNetwork : '';
      const apiVersion = options.apiVersion || 'v1';
      // Parse hostAliases option:
      //   - string from CLI: "ip1=host1,host2;ip2=host3,host4"
      //   - array from programmatic callers: [{ ip: "127.0.0.1", hostnames: ["foo.local"] }]
      const hostAliases = options.hostAliases
        ? Array.isArray(options.hostAliases)
          ? options.hostAliases
          : options.hostAliases
              .split(';')
              .filter((entry) => entry.trim())
              .map((entry) => {
                const [ip, hostnamesStr] = entry.split('=');
                const hostnames = hostnamesStr ? hostnamesStr.split(',').map((h) => h.trim()) : [];
                return { ip: ip.trim(), hostnames };
              })
        : [];
      const hostAliasesYaml =
        hostAliases.length > 0
          ? `  hostAliases:\n${hostAliases
              .map(
                (alias) =>
                  `  - ip: "${alias.ip}"\n    hostnames:\n${alias.hostnames.map((h) => `    - "${h}"`).join('\n')}`,
              )
              .join('\n')}`
          : '';
      const labels = options.labels
        ? options.labels
            .split(',')
            .map((keyValue) => {
              const [key, value] = keyValue.split('=');
              return `    ${key}: ${value}
`;
            })
            .join('')
        : `    app: ${podName}`;
      if (options.volumeType === 'dev') options.volumeType = 'FileOrCreate';
      const volumeType =
        options.volumeType || (enableVolumeMount && volumeHostPath && fs.statSync(volumeHostPath).isDirectory())
          ? 'Directory'
          : 'File';

      const envs = Underpost.env.list();

      const cmd = `kubectl apply -f - <<EOF
apiVersion: ${apiVersion}
kind: ${kindType}
metadata:
  name: ${podName}
  namespace: ${namespace}
  labels:
${labels}
spec:
  restartPolicy: ${restartPolicy}
${runtimeClassName ? `  runtimeClassName: ${runtimeClassName}` : ''}
${hostNetwork ? `  hostNetwork: ${hostNetwork}` : ''}
${hostAliasesYaml}
  containers:
    - name: ${containerName}
      image: ${imageName}
      imagePullPolicy: ${imagePullPolicy}
      tty: ${tty}
      stdin: ${stdin}
      command: ${JSON.stringify(options.cmd ? options.cmd : ['/bin/bash', '-c'])}
${
  args.length > 0
    ? `      args:
        - |
${args.map((arg) => `          ${arg}`).join('\n')}`
    : ''
}
${`${
  gpuEnable
    ? `      resources:
        limits:
          nvidia.com/gpu: '1'
`
    : ''
}      env:
${Object.keys(envs)
  .map((key) => ({ key, value: typeof envs[key] === 'number' ? envs[key] : `"${envs[key]}"` }))
  .concat(gpuEnable ? [{ key: 'NVIDIA_VISIBLE_DEVICES', value: 'all' }] : [])
  .map((env) => `        - name: ${env.key}\n          value: ${env.value}`)
  .join('\n')}`}
${
  enableVolumeMount
    ? Underpost.deploy.volumeFactory([{ volumeMountPath, volumeName, volumeHostPath, volumeType, claimName }]).render
    : ''
}
EOF`;
      shellExec(`kubectl delete pod ${podName} -n ${namespace} --ignore-not-found`);
      console.log(cmd);
      shellExec(cmd, { disableLog: true });
      const successInstance = await Underpost.test.statusMonitor(
        podName,
        options.monitorStatus || 'Running',
        options.monitorStatusKindType || 'pods',
        options.monitorStatusDeltaMs || 1000,
        options.monitorStatusMaxAttempts || 600,
      );
      if (successInstance) {
        options.on?.init ? await options.on.init() : null;
        if (options.logs) shellExec(`kubectl logs -f ${podName} -n ${namespace}`, { async: true });
      }
    },

    /**
     * @method push-bundle
     * @description Builds the client zip for the specified deployment, splits it into parts, and uploads to file storage.
     *   Steps: set env, build+split zip, switch to cron env, upload parts to storage.
     * @param {string} path - Optional `fsPath.splitOption` string.
     *   Examples: `build` (default split 8), `build.16` (split 16 MB), `build.none-split` (no split flag).
     * @param {Object} options - The default underpost runner options for customizing workflow.
     * @param {string} [options.deployId] - Override deploy ID.
     * @param {boolean} [options.dev] - Use development environment; defaults to production.
     * @memberof UnderpostRun
     */
    'push-bundle': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const env = options.dev ? 'development' : 'production';
      const deployId = options.deployId || 'dd-default';
      const pathParts = (path || '').split('.');
      const fsPath = (pathParts[0] || '').trim() || 'build';
      const splitOption = (pathParts[1] || '').trim();

      let splitFlag = '--split 8';
      if (splitOption) {
        if (splitOption === 'none-split') {
          splitFlag = '';
        } else {
          const splitMb = Number(splitOption);
          if (Number.isFinite(splitMb) && splitMb > 0) {
            splitFlag = `--split ${splitMb}`;
          } else {
            logger.warn('push-bundle: invalid split option, using default split 8', {
              path,
              splitOption,
            });
          }
        }
      }

      shellExec(`${baseCommand} env ${deployId} ${env}`);
      shellExec(`${baseCommand} client ${deployId} --build-zip${splitFlag ? ` ${splitFlag}` : ''}`);
      shellExec(
        `${baseCommand} fs ${fsPath} --recursive --deploy-id ${deployId} --storage-file-path engine-private/conf/${deployId}/storage.bundle.json --force`,
      );
    },

    /**
     * @method pull-bundle
     * @description Downloads split zip parts from file storage, merges and extracts them, and moves the result into the public directory.
     *   Steps: set cron env, download parts (omit-unzip), merge zip, unzip, remove zip, move to public/<host>.
     * @param {string} path - Optional host name(s) used to locate zip(s) and as public destination(s) (e.g. 'underpost.net' or 'a.com,b.com').
     *   If omitted, hosts are loaded from `engine-private/conf/<deployId>/conf.server.json`.
     * @param {Object} options - The default underpost runner options for customizing workflow.
     * @param {string} [options.deployId] - Deploy ID for storage lookup (defaults to 'dd-default').
     * @param {boolean} [options.dev] - Use development environment; defaults to production.
     * @memberof UnderpostRun
     */
    'pull-bundle': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const env = options.dev ? 'development' : 'production';
      const deployId = options.deployId || 'dd-default';
      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      const hosts = path
        ? path
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean)
        : fs.existsSync(confServerPath)
          ? Object.keys(loadConfServerJson(confServerPath))
          : [];

      if (hosts.length === 0) {
        logger.error('pull-bundle: no hosts resolved', {
          deployId,
          path,
          confServerPath,
        });
        return;
      }

      shellExec(`${baseCommand} env ${deployId} ${env}`);
      if (!fs.existsSync('./build')) fs.mkdirSync('./build', { recursive: true });
      shellExec(
        `${baseCommand} fs build --recursive --deploy-id ${deployId} --storage-file-path engine-private/conf/${deployId}/storage.bundle.json --pull --omit-unzip`,
      );
      for (const host of hosts) {
        const zipPath = `build/${host}-.zip`;
        const hasZip = fs.existsSync(zipPath);
        const hasParts =
          fs.existsSync('./build') &&
          fs
            .readdirSync('./build')
            .some((name) => name.startsWith(`${host}-.zip.part`) || name.startsWith(`${host}-.zip-part`));

        if (!hasZip && !hasParts) {
          logger.warn(`Bundle not found for host '${host}'. Skipping host.`, {
            zipPath,
            deployId,
          });
          continue;
        }

        if (hasParts) shellExec(`${baseCommand} client --merge-zip ${zipPath}`);
        shellExec(`${baseCommand} client --unzip ${zipPath}`);
        shellExec(`sudo rm -rf ${zipPath}`);
        if (fs.existsSync(`public/${host}`)) shellExec(`sudo rm -rf public/${host}`);
        shellExec(`sudo mv build/${host} public/${host}`);
      }
    },
  };

  static API = {
    /**
     * @method DEFAULT_OPTION
     * @description The default options for Underpost runners, including development mode, namespace, replicas, and underpost root path.
     * @memberof UnderpostRun
     * @static
     * @returns {Object} The default options object.
     */
    get DEFAULT_OPTION() {
      return DEFAULT_OPTION;
    },
    /**
     * @method RUNNERS
     * @description Retrieves the list of available runner IDs from the UnderpostRun class.
     * @memberof UnderpostRun
     * @returns {string[]} An array of runner IDs.
     */
    get RUNNERS() {
      return Object.keys(UnderpostRun.RUNNERS);
    },

    /**
     * @method CALL
     * @description Executes a specified runner function from the UnderpostRun class with the provided path and options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Promise<any>} The result of the runner execution.
     */
    async CALL(runner = '', path = '', options = DEFAULT_OPTION) {
      return await UnderpostRun.RUNNERS[runner](path, options);
    },

    /**
     * @method callback
     * @description Initiates the execution of a specified CLI command (runner) with the given input value (`path`) and processed options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Promise<any>} The result of the callback execution.
     */
    async callback(runner, path, options = DEFAULT_OPTION) {
      try {
        const npmRoot = getNpmRootPath();
        const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
        if (options.cmd) options.cmd = options.cmd.split(',');
        if (options.args) options.args = options.args.split(',');
        if (!options.underpostRoot) options.underpostRoot = underpostRoot;
        if (!options.namespace) options.namespace = 'default';
        if (options.replicas === '' || options.replicas === null || options.replicas === undefined)
          options.replicas = 1;
        options.npmRoot = npmRoot;
        logger.info('callback', { path, options });
        if (!Underpost.run.RUNNERS.includes(runner)) throw new Error(`Runner not found: ${runner}`);
        const result = await Underpost.run.CALL(runner, path, options);
        return result;
      } catch (error) {
        console.log(error);
        logger.error(error);
        return null;
      }
    },
  };
}

export default UnderpostRun;
