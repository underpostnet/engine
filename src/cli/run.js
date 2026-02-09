/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, openTerminal, shellCd, shellExec } from '../server/process.js';
import {
  awaitDeployMonitor,
  buildKindPorts,
  Config,
  getNpmRootPath,
  isDeployRunnerContext,
  writeEnv,
} from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';

import fs from 'fs-extra';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';

import os from 'os';
import Underpost from '../index.js';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

/**
 * @constant DEFAULT_OPTION
 * @description Default options for the UnderpostRun class.
 * @type {Object}
 * @property {boolean} dev - Whether to run in development mode.
 * @property {string} podName - The name of the pod to run.
 * @property {string} nodeName - The name of the node to run.
 * @property {number} port - Custom port to use.
 * @property {boolean} etcHosts - Whether to modify /etc/hosts.
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
 * @property {boolean} terminal - Whether to open a terminal.
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
 * @property {string} cronJobs - The cron jobs to run.
 * @property {string} timezone - The timezone to set.
 * @property {boolean} kubeadm - Whether to run in kubeadm mode.
 * @property {boolean} kind - Whether to run in kind mode.
 * @property {boolean} k3s - Whether to run in k3s mode.
 * @property {string} logType - The type of log to generate.
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
  terminal: false,
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
  cronJobs: '',
  timezone: '',
  kubeadm: false,
  kind: false,
  k3s: false,
  logType: '',
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
        // Detect MongoDB primary pod using centralized method
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
      console.log('Loading fordward services...');
      await timer(5000);
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
     * @description Cleans up, pushes `engine-private` and `engine` repositories with a commit tag `ci package-pwa-microservices-template`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run clean`);
      shellExec(
        `${baseCommand} push ./engine-private ${options.force ? '-f ' : ''}${
          process.env.GITHUB_USERNAME
        }/engine-private`,
      );
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(
        `${baseCommand} cmt . --empty ci package-pwa-microservices-template${
          path.startsWith('sync') ? `-${path}` : ''
        }`,
      );
      shellExec(`${baseCommand} push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`);
    },

    /**
     * @method template-deploy-image
     * @description Commits and pushes a Docker image deployment for the `engine` repository.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy-image': (path, options = DEFAULT_OPTION) => {
      // const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(
        `cd /home/dd/engine && git reset && underpost cmt . --empty ci docker-image 'underpost-engine:${
          Underpost.version
        }' && underpost push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`,
      );
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
     * @description Performs a Git reset, commits with a message `cd ssh-${path}`, and pushes the `engine` repository, likely triggering an SSH-based CD pipeline.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment identifier for the commit message).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy': (path, options = DEFAULT_OPTION) => {
      actionInitLog();
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(`${baseCommand} cmt . --empty cd ssh-${path}`);
      shellExec(`${baseCommand} push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`);
    },
    /**
     * @method ide
     * @description Opens a Visual Studio Code (VS Code) session for the specified path using `node ${underpostRoot}/bin/zed ${path}`,
     * or installs Zed and sublime-text IDE if `path` is 'install'.
     * @param {string} path - The input value, identifier, or path for the operation (used as the path to the directory to open in the IDE).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ide: (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      if (path === 'install') {
        shellExec(`sudo curl -f https://zed.dev/install.sh | sh`);
        shellExec(
          `sudo dnf config-manager --add-repo https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo`,
        );
        shellExec(`sudo dnf install -y sublime-text`);
      } else shellExec(`node ${underpostRoot}/bin/zed ${path}`);
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
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const defaultPath = [
        'dd-default',
        options.replicas,
        ``,
        ``,
        options.dev || !isDeployRunnerContext(path, options) ? 'kind-control-plane' : os.hostname(),
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
        if (options.cronJobs !== 'none') shellExec(`${baseCommand} run${baseClusterCommand} cron`);
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

      shellExec(
        `${baseCommand} deploy --kubeadm --build-manifest --sync --info-router --replicas ${replicas} --node ${node}${
          image ? ` --image ${image}` : ''
        }${versions ? ` --versions ${versions}` : ''}${
          options.namespace ? ` --namespace ${options.namespace}` : ''
        }${timeoutFlags}${cmdString} dd ${env}`,
      );

      if (isDeployRunnerContext(path, options)) {
        shellExec(
          `${baseCommand} deploy --kubeadm${cmdString} --replicas ${replicas} --disable-update-proxy ${deployId} ${env} --versions ${versions}${
            options.namespace ? ` --namespace ${options.namespace}` : ''
          }${timeoutFlags}`,
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
     * @method cron
     * @description Sets up and starts the `dd-cron` environment by writing environment variables, starting the cron service, and cleaning up.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    cron: (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      shellExec(`node bin env ${path ? path : 'dd-cron'} ${env}`);
      shellExec(`npm start`);
      shellExec(`node bin env clean`);
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
      for (const instance of confInstances) {
        let {
          id: _id,
          host: _host,
          path: _path,
          image: _image,
          fromPort: _fromPort,
          toPort: _toPort,
          cmd: _cmd,
          volumes: _volumes,
          metadata: _metadata,
        } = instance;
        if (id !== _id) continue;
        const _deployId = `${deployId}-${_id}`;
        const currentTraffic = Underpost.deploy.getCurrentTraffic(_deployId, {
          hostTest: _host,
          namespace: options.namespace,
        });
        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
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
          cmd: _cmd,
          volumes: _volumes,
          metadata: _metadata,
        } = instance;
        if (id !== _id) continue;
        const _deployId = `${deployId}-${_id}`;
        etcHosts.push(_host);
        if (options.expose) continue;
        // Examples images:
        // `underpost/underpost-engine:${Underpost.version}`
        // `localhost/rockylinux9-underpost:${Underpost.version}`
        if (!_image) _image = `underpost/underpost-engine:${Underpost.version}`;

        if (options.nodeName) {
          shellExec(`sudo crictl pull ${_image}`);
        } else {
          shellExec(`docker pull ${_image}`);
          shellExec(`sudo kind load docker-image ${_image}`);
        }

        const currentTraffic = Underpost.deploy.getCurrentTraffic(_deployId, {
          hostTest: _host,
          namespace: options.namespace,
        });

        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
        const podId = `${_deployId}-${env}-${targetTraffic}`;
        const ignorePods = Underpost.deploy.get(podId, 'pods', options.namespace).map((p) => p.NAME);
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
            });
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
    cmd: _cmd[env],
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
          options.logType,
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
     * @method ls-deployments
     * @description Retrieves and logs a table of Kubernetes deployments using `Underpost.deploy.get`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional deployment name filter).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = DEFAULT_OPTION) => {
      console.table(await Underpost.deploy.get(path, 'deployments', options.namespace));
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
          init: async () => {
            // openTerminal(`kubectl logs -f ${podName}`);
          },
        },
        args: [daemonProcess(path ? path : `cd /home/dd/engine && npm install && npm run test`)],
      };

      await Underpost.run.RUNNERS['deploy-job'](path, payload);
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

      const image = 'adminer:4.7.6-standalone';

      if (!options.kubeadm && !options.k3s) {
        // Only load if not kubeadm/k3s (Kind needs it)
        shellExec(`docker pull ${image}`);
        shellExec(`sudo kind load docker-image ${image}`);
      } else if (options.kubeadm || options.k3s)
        // For kubeadm/k3s, ensure it's available for containerd
        shellExec(`sudo crictl pull ${image}`);

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
        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
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
      shellExec(`${baseCommand} cluster${baseClusterCommand} --reset`);
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
      if (!fs.existsSync(`./engine-private/conf/${deployId}`)) Config.deployIdFactory(deployId, { subConf });
      if (options.devProxyPortOffset) {
        const envPath = `./engine-private/conf/${deployId}/.env.development`;
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        envObj.DEV_PROXY_PORT_OFFSET = options.devProxyPortOffset;
        writeEnv(envPath, envObj);
      }
      shellExec(`node bin run dev-cluster --expose --namespace ${options.namespace}`, { async: true });
      {
        const cmd = `npm run dev-api ${deployId} ${subConf} ${host} ${_path} ${clientHostPort}${
          options.tls ? ' tls' : ''
        }`;
        options.terminal ? openTerminal(cmd) : shellExec(cmd, { async: true });
      }
      await awaitDeployMonitor(true);
      {
        const cmd = `npm run dev-client ${deployId} ${subConf} ${host} ${_path} proxy${options.tls ? ' tls' : ''}`;
        options.terminal
          ? openTerminal(cmd)
          : shellExec(cmd, {
              async: true,
            });
      }
      await awaitDeployMonitor(true);
      shellExec(
        `./node_modules/.bin/env-cmd -f .env.development node src/proxy proxy ${deployId} ${subConf} ${host} ${_path}${
          options.tls ? ' tls' : ''
        }`,
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
      const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
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
        const confServer = JSON.parse(
          fs.readFileSync(`./engine-private/conf/${options.deployId}/conf.server.json`, 'utf8'),
        );
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
     * @method ptls
     * @description Set on ~/.bashrc alias: ports <port> Command to list listening ports that match the given keyword.
     * @param {string} path - The input value, identifier, or path for the operation (used as a keyword to filter listening ports).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ptls: async (path = '', options = DEFAULT_OPTION) => {
      shellExec(`chmod +x ${options.underpostRoot}/scripts/ports-ls.sh`);
      shellExec(`${options.underpostRoot}/scripts/ports-ls.sh`);
    },
    /**
     * @method release-cmt
     * @description Commits and pushes a new release for the `engine` repository with a message indicating the new version.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'release-cmt': async (path, options = DEFAULT_OPTION) => {
      shellExec(`underpost run pull`);
      shellExec(`underpost run secret`);
      shellCd(`/home/dd/engine`);
      shellExec(`underpost cmt --empty . ci engine ' New engine release $(underpost --version)'`);
      shellExec(`underpost push . ${process.env.GITHUB_USERNAME}/engine`, { silent: true });
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
            `${baseCommand} secret underpost --create-from-file /etc/config/.env.${env}`,
            `${baseCommand} start --build --run ${deployId} ${env} --underpost-quickly-install`,
          ];
      shellExec(`node bin run sync${baseClusterCommand} --cron-jobs none dd-test --cmd "${cmd}"`);
    },

    /**
     * @method sync-replica
     * @description Syncs a replica for the dd.router
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'sync-replica': async (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';

      for (let deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
        deployId = deployId.trim();
        const _path = '/single-replica';
        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        shellExec(`${baseCommand} env ${deployId} ${env}`);
        for (const host of Object.keys(confServer))
          if (_path in confServer[host]) shellExec(`node bin/deploy build-single-replica ${deployId} ${host} ${_path}`);
        const node = options.nodeName
          ? options.nodeName
          : options.dev || !isDeployRunnerContext(path, options)
            ? 'kind-control-plane'
            : os.hostname();
        // deployId, replicas, versions, image, node
        let defaultPath = [deployId, 1, ``, ``, node];
        shellExec(`${baseCommand} run${options.dev === true ? ' --dev' : ''} --build sync ${defaultPath}`);
        shellExec(`node bin/deploy build-full-client ${deployId}`);
      }
      if (isDeployRunnerContext(path, options)) shellExec(`${baseCommand} run promote ${path} production`);
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
                while (!Underpost.deploy.existsContainerFile({ podName, path: checkAwaitPath })) {
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
                  while (!Underpost.deploy.existsContainerFile({ podName, path: checkAwaitPath })) {
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

                openTerminal(`firefox ${outsPaths.join(' ')}`, { single: true });
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

      shellExec(`git init && git add . && git commit -m "Base implementation"`);
      shellExec(`chmod +x ./replace_params.sh`);
      shellExec(`chmod +x ./build.sh`);

      shellExec(`./replace_params.sh`);
      shellExec(`./build.sh`);

      shellCd('/home/dd/engine');
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
    secret: (path, options = DEFAULT_OPTION) => {
      const secretPath = path ? path : `/home/dd/engine/engine-private/conf/dd-cron/.env.production`;
      const command = options.dev
        ? `node bin secret underpost --create-from-file ${secretPath}`
        : `underpost secret underpost --create-from-file ${secretPath}`;
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
      shellExec(
        `node bin cluster --dev --reset && node bin cluster --dev --dedicated-gpu --kubeadm && kubectl get pods --all-namespaces -o wide -w`,
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
