/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, openTerminal, pbcopy, shellCd, shellExec } from '../server/process.js';
import {
  awaitDeployMonitor,
  buildKindPorts,
  Config,
  getNpmRootPath,
  getUnderpostRootPath,
  isDeployRunnerContext,
  writeEnv,
} from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import UnderpostTest from './test.js';
import fs from 'fs-extra';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';
import UnderpostDeploy from './deploy.js';
import UnderpostRootEnv from './env.js';
import UnderpostRepository from './repository.js';
import os from 'os';
import Underpost from '../index.js';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

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
   * @property {boolean} build - Whether to build the image.
   * @property {number} replicas - The number of replicas to run.
   * @property {boolean} k3s - Whether to run in k3s mode.
   * @property {boolean} kubeadm - Whether to run in kubeadm mode.
   * @property {boolean} force - Whether to force the operation.
   * @property {boolean} reset - Whether to reset the operation.
   * @property {boolean} tls - Whether to use TLS.
   * @property {string} tty - The TTY option for the container.
   * @property {string} stdin - The stdin option for the container.
   * @property {string} restartPolicy - The restart policy for the container.
   * @property {string} runtimeClassName - The runtime class name for the container.
   * @property {string} imagePullPolicy - The image pull policy for the container.
   * @property {string} apiVersion - The API version for the container.
   * @property {string} claimName - The claim name for the volume.
   * @property {string} kind - The kind of resource to create.
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
   * @memberof UnderpostRun
   */
  static DEFAULT_OPTION = {
    dev: false,
    podName: '',
    nodeName: '',
    port: 0,
    volumeHostPath: '',
    volumeMountPath: '',
    imageName: '',
    containerName: '',
    namespace: 'default',
    build: false,
    replicas: 1,
    k3s: false,
    kubeadm: false,
    force: false,
    reset: false,
    tls: false,
    tty: '',
    stdin: '',
    restartPolicy: '',
    runtimeClassName: '',
    imagePullPolicy: '',
    apiVersion: '',
    claimName: '',
    kind: '',
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
  };
  /**
   * @static
   * @description Collection of runners for executing specific commands.
   * @type {Object}
   * @memberof UnderpostRun
   */
  static RUNNERS = {
    /**
     * @method spark-template
     * @description Creates a new Spark template project using `sbt new` in `/home/dd/spark-template`, initializes a Git repository, and runs `replace_params.sh` and `build.sh`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'spark-template': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    rmi: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`podman rmi $(podman images -qa) --force`);
    },
    /**
     * @method kill
     * @description Kills processes listening on the specified port(s). If the `path` contains a `+`, it treats it as a range of ports to kill.
     * @param {string} path - The input value, identifier, or path for the operation (used as the port number).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    kill: (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
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
    secret: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(
        `underpost secret underpost --create-from-file ${
          path ? path : `/home/dd/engine/engine-private/conf/dd-cron/.env.production`
        }`,
      );
    },
    /**
     * @method underpost-config
     * @description Calls `UnderpostDeploy.API.configMap` to create a Kubernetes ConfigMap, defaulting to the 'production' environment.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional configuration name/environment).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'underpost-config': (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      UnderpostDeploy.API.configMap(path ? path : 'production', options.namespace);
    },
    /**
     * @method gpu-env
     * @description Sets up a dedicated GPU development environment cluster, resetting and then setting up the cluster with `--dedicated-gpu` and monitoring the pods.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'gpu-env': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'tf-gpu-test': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot, namespace } = options;
      shellExec(`kubectl delete configmap tf-gpu-test-script -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pod tf-gpu-test-pod -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml -n ${namespace}`);
    },
    /**
     * @method dev-cluster
     * @description Resets and deploys a full development cluster including MongoDB, Valkey, exposes services, and updates `/etc/hosts` for local access.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-cluster': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
      shellExec(`${baseCommand} deploy --expose --disable-update-underpost-config mongo`, { async: true });
      shellExec(`${baseCommand} deploy --expose --disable-update-underpost-config valkey`, { async: true });
      {
        const hostListenResult = UnderpostDeploy.API.etcHostFactory(mongoHosts);
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
    metadata: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const ports = '6379,27017';
      shellExec(`node bin run kill '${ports}'`);
      shellExec(`node bin run dev-cluster --dev --expose`, { async: true });
      console.log('Loading fordward services...');
      await timer(5000);
      shellExec(`node bin metadata --generate ${path}`);
      shellExec(`node bin run kill '${ports}'`);
    },

    /**
     * @method svc-ls
     * @description Lists systemd services and installed packages, optionally filtering by the provided path.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional filter for services and packages).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'svc-ls': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'svc-rm': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`sudo systemctl stop ${path}`);
      shellExec(`sudo systemctl disable --now ${path}`);
      shellExec(`sudo dnf remove -y ${path}*`);
      shellExec(`sudo rm -f /usr/lib/systemd/system/${path}.service`);
      shellExec(`sudo rm -f /etc/yum.repos.d/${path}*.repo`);
    },

    /**
     * @method ssh-cluster-info
     * @description Executes the `ssh-cluster-info.sh` script to display cluster connection information.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-cluster-info': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/ssh-cluster-info.sh`);
      shellExec(`${underpostRoot}/scripts/ssh-cluster-info.sh`);
    },

    /**
     * @method dev-hosts-expose
     * @description Deploys a specified service in development mode with `/etc/hosts` modification for local access.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID to deploy).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-hosts-expose': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'dev-hosts-restore': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`node bin deploy --restore-hosts`);
    },

    /**
     * @method cluster-build
     * @description Build configuration for cluster deployment.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'cluster-build': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const nodeOptions = options.nodeName ? ` --node-name ${options.nodeName}` : '';
      shellExec(`node bin run clean`);
      shellExec(`node bin run --dev sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin run sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin env clean`);
      for (const deployId of fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').split(','))
        shellExec(`node bin/deploy update-default-conf ${deployId.trim()}`);
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
    'template-deploy': (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run clean`);
      shellExec(
        `${baseCommand} push ./engine-private ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine-private`,
      );
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(
        `${baseCommand} cmt . --empty ci package-pwa-microservices-template${path.startsWith('sync') ? `-${path}` : ''}`,
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
    'template-deploy-image': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      // const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(
        `cd /home/dd/engine && git reset && underpost cmt . --empty ci docker-image 'underpost-engine:${Underpost.version}' && underpost push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`,
      );
    },
    /**
     * @method clean
     * @description Changes directory to the provided path (defaulting to `/home/dd/engine`) and runs `node bin/deploy clean-core-repo`.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional directory path).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    clean: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellCd(path ?? `/home/dd/engine`);
      shellExec(`node bin/deploy clean-core-repo`);
    },
    /**
     * @method pull
     * @description Clones or pulls updates for the `engine` and `engine-private` repositories into `/home/dd/engine` and `/home/dd/engine/engine-private`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    pull: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      if (!fs.existsSync(`/home/dd`) || !fs.existsSync(`/home/dd/engine`)) {
        fs.mkdirSync(`/home/dd`, { recursive: true });
        shellExec(`cd /home/dd && underpost clone ${process.env.GITHUB_USERNAME}/engine`);
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
        );
    },
    /**
     * @method release-deploy
     * @description Executes deployment (`underpost run deploy`) for all deployment IDs listed in `./engine-private/deploy/dd.router`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'release-deploy': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'ssh-deploy': (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    ide: (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
     * @method sync
     * @description Cleans up, and then runs a deployment synchronization command (`underpost deploy --kubeadm --build-manifest --sync...`) using parameters parsed from `path` (deployId, replicas, versions, image, node).
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string containing deploy parameters).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sync: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      // Dev usage: node bin run --dev --build sync dd-default
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const defaultPath = [
        'dd-default',
        1,
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
        const { validVersion } = UnderpostRepository.API.privateConfUpdate(deployId);
        if (!validVersion) throw new Error('Version mismatch');
        shellExec(`${baseCommand} run${baseClusterCommand} tz`);
        shellExec(`${baseCommand} run${baseClusterCommand} cron`);
      }

      const currentTraffic = isDeployRunnerContext(path, options)
        ? UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace })
        : '';
      let targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : '';
      if (targetTraffic) versions = targetTraffic;

      shellExec(
        `${baseCommand} deploy --kubeadm --build-manifest --sync --info-router --replicas ${
          replicas ? replicas : 1
        } --node ${node}${image ? ` --image ${image}` : ''}${versions ? ` --versions ${versions}` : ''}${options.namespace ? ` --namespace ${options.namespace}` : ''} dd ${env}`,
      );

      if (isDeployRunnerContext(path, options)) {
        shellExec(
          `${baseCommand} deploy --kubeadm --disable-update-proxy ${deployId} ${env} --versions ${versions}${options.namespace ? ` --namespace ${options.namespace}` : ''}`,
        );
        if (!targetTraffic)
          targetTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace });
        await UnderpostDeploy.API.monitorReadyRunner(deployId, env, targetTraffic);
        UnderpostDeploy.API.switchTraffic(deployId, env, targetTraffic);
      } else
        logger.info(
          'current traffic',
          UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace }),
        );
    },

    /**
     * @method tz
     * @description Sets the system timezone using `timedatectl set-timezone` command.
     * @param {string} path - The input value, identifier, or path for the operation (used as the timezone string).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    tz: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const tz = path
        ? path
        : UnderpostRootEnv.API.get('TIME_ZONE', undefined, { disableLog: true })
          ? UnderpostRootEnv.API.get('TIME_ZONE')
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
    cron: (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'get-proxy': async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
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

    'instance-promote': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
        const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(_deployId, {
          hostTest: _host,
        });
        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
        let proxyYaml =
          UnderpostDeploy.API.baseProxyYamlFactory({ host: _host, env: options.tls ? 'production' : env, options }) +
          UnderpostDeploy.API.deploymentYamlServiceFactory({
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
          proxyYaml += UnderpostDeploy.API.buildCertManagerCertificate({ ...options, host: _host });
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
    instance: async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      let [deployId, id, replicas = 1] = path.split(',');
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

        const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(_deployId, {
          hostTest: _host,
        });

        const targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'blue';
        const podId = `${_deployId}-${env}-${targetTraffic}`;
        const ignorePods = UnderpostDeploy.API.get(podId).map((p) => p.NAME);
        UnderpostDeploy.API.configMap(env, options.namespace);
        shellExec(`kubectl delete service ${podId}-service --namespace ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl delete deployment ${podId} --namespace ${options.namespace} --ignore-not-found`);
        for (const _volume of _volumes)
          if (_volume.claimName)
            UnderpostDeploy.API.deployVolume(_volume, {
              namespace: options.namespace,
              deployId: _deployId,
              env,
              version: targetTraffic,
              nodeName: options.nodeName,
            });
        let deploymentYaml = `---
${UnderpostDeploy.API.deploymentYamlPartsFactory({
  deployId: _deployId,
  env,
  suffix: targetTraffic,
  resources: UnderpostDeploy.API.resourcesFactory(options),
  replicas,
  image: _image,
  namespace: options.namespace,
  volumes: _volumes,
  cmd: _cmd[env],
}).replace('{{ports}}', buildKindPorts(_fromPort, _toPort))}
`;
        // console.log(deploymentYaml);
        shellExec(
          `kubectl apply -f - -n ${options.namespace} <<EOF
${deploymentYaml}
EOF
`,
          { disableLog: true },
        );
        const { ready, readyPods } = await UnderpostDeploy.API.monitorReadyRunner(
          _deployId,
          env,
          targetTraffic,
          ignorePods,
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
        const hostListenResult = UnderpostDeploy.API.etcHostFactory(etcHosts);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method ls-deployments
     * @description Retrieves and logs a table of Kubernetes deployments using `UnderpostDeploy.API.get`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional deployment name filter).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      console.table(await UnderpostDeploy.API.get(path, 'deployments', options.namespace));
    },
    /**
     * @method ls-images
     * @description Retrieves and logs a table of currently loaded Docker images in the 'kind-worker' node using `UnderpostDeploy.API.getCurrentLoadedImages`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-images': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      console.table(
        UnderpostDeploy.API.getCurrentLoadedImages(
          options.nodeName ? options.nodeName : 'kind-worker',
          path === 'spec' ? true : false,
        ),
      );
    },

    /**
     * @method host-update
     * @description Executes the `rocky-setup.sh` script to update the host system configuration.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'host-update': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      // const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`chmod +x ${options.underpostRoot}/scripts/rocky-setup.sh`);
      shellExec(`${options.underpostRoot}/scripts/rocky-setup.sh --yes${options.dev ? ' --install-dev' : ``}`);
    },

    /**
     * @method dd-container
     * @description Deploys a development or debug container tasks jobs, setting up necessary volumes and images, and running specified commands within the container.
     * @param {string} path - The input value, identifier, or path for the operation (used as the command to run inside the container).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dd-container': async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const currentImage = options.imageName
        ? options.imageName
        : UnderpostDeploy.API.getCurrentLoadedImages(options.nodeName ? options.nodeName : 'kind-worker', false).find(
            (o) => o.IMAGE.match('underpost'),
          );
      const podName = options.podName || `underpost-dev-container`;
      const volumeHostPath = options.claimName || '/home/dd';
      const claimName = options.claimName || `pvc-dd`;

      if (!options.nodeName) {
        shellExec(`docker exec -i kind-worker bash -c "rm -rf ${volumeHostPath}"`);
        shellExec(`docker exec -i kind-worker bash -c "mkdir -p ${volumeHostPath}"`);
        shellExec(`docker cp ${volumeHostPath}/engine kind-worker:${volumeHostPath}/engine`);
        shellExec(
          `docker exec -i kind-worker bash -c "chown -R 1000:1000 ${volumeHostPath} || true; chmod -R 755 ${volumeHostPath}"`,
        );
      } else {
        shellExec(`kubectl apply -f ${options.underpostRoot}/manifests/pv-pvc-dd.yaml -n ${options.namespace}`);
      }

      if (!currentImage)
        shellExec(
          `${baseCommand} dockerfile-pull-base-images${baseClusterCommand} ${options.dev ? '--kind-load' : '--kubeadm-load'}`,
        );
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

      await UnderpostRun.RUNNERS['deploy-job'](path, payload);
    },

    /**
     * @method ip-info
     * @description Executes the `ip-info.sh` script to display IP-related information for the specified path.
     * @param {string} path - The input value, identifier, or path for the operation (used as an argument to the script).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ip-info': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/ip-info.sh`);
      shellExec(`${underpostRoot}/scripts/ip-info.sh ${path}`);
    },

    /**
     * @method monitor
     * @description Monitors a specific pod (identified by `path`) for the existence of a file (`/await`), and performs conditional actions (like file copying and opening Firefox) when the file is removed.
     * @param {string} path - The input value, identifier, or path for the operation (used as the name of the pod to monitor).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    monitor: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const pid = getTerminalPid();
      logger.info('monitor pid', pid);
      const checkPath = '/await';
      const _monitor = async () => {
        const result = UnderpostDeploy.API.existsContainerFile({ podName: path, path: checkPath });
        logger.info('monitor', result);
        if (result === true) {
          switch (path) {
            case 'tf-vae-test':
              {
                const nameSpace = options.namespace || 'default';
                const podName = path;
                const basePath = '/home/dd';
                const scriptPath = '/site/en/tutorials/generative/cvae.py';
                // shellExec(
                //   `sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${scriptPath} ${basePath}/lab/src/${scriptPath
                //     .split('/')
                //     .pop()}`,
                // );
                // const file = fs.readFileSync(`${basePath}/lab/src/${scriptPath.split('/').pop()}`, 'utf8');
                //                 fs.writeFileSync(
                //                   `${basePath}/lab/src/${scriptPath.split('/').pop()}`,
                //                   file.replace(
                //                     `import time`,
                //                     `import time
                // print('=== SCRIPT UPDATE TEST ===')`,
                //                   ),
                //                   'utf8',
                //                 );
                shellExec(
                  `sudo kubectl cp ${basePath}/lab/src/${scriptPath
                    .split('/')
                    .pop()} ${nameSpace}/${podName}:${basePath}/docs${scriptPath}`,
                );
                // shellExec(`sudo kubectl exec -i ${podName} -- sh -c "ipython ${basePath}/docs${scriptPath}"`);
                shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf ${checkPath}"`);

                {
                  const checkPath = `/latent_space_plot.png`;
                  const outsPaths = [];
                  logger.info('monitor', checkPath);
                  while (!UnderpostDeploy.API.existsContainerFile({ podName, path: `/home/dd/docs${checkPath}` }))
                    await timer(1000);

                  {
                    const toPath = `${basePath}/lab${checkPath}`;
                    outsPaths.push(toPath);
                    shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${checkPath} ${toPath}`);
                  }

                  for (let i of range(1, 10)) {
                    i = `/image_at_epoch_${setPad(i, '0', 4)}.png`;
                    const toPath = `${basePath}/lab/${i}`;
                    outsPaths.push(toPath);
                    shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${i} ${toPath}`);
                  }
                  openTerminal(`firefox ${outsPaths.join(' ')}`, { single: true });
                }
                shellExec(`sudo kill -9 ${pid}`);
              }
              break;

            default:
              break;
          }
          return;
        }
        await timer(1000);
        _monitor();
      };
      _monitor();
    },
    /**
     * @method db-client
     * @description Deploys and exposes the Adminer database client application (using `adminer:4.7.6-standalone` image) on the cluster.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'db-client': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
      const successInstance = await UnderpostTest.API.statusMonitor('adminer', 'Running', 'pods', 1000, 60 * 10);

      if (successInstance) {
        shellExec(`underpost deploy --expose adminer`);
      }
    },

    /**
     * @method git-conf
     * @description Configures Git global and local user name and email settings based on the provided `path` (formatted as `username,email`), or defaults to environment variables.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string: `username,email`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'git-conf': (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const defaultUsername = UnderpostRootEnv.API.get('GITHUB_USERNAME');
      const defaultEmail = UnderpostRootEnv.API.get('GITHUB_EMAIL');
      const validPath = path && path.split(',').length;
      const [username, email] = validPath ? path.split(',') : [defaultUsername, defaultEmail];
      if (validPath) {
        UnderpostRootEnv.API.set('GITHUB_USERNAME', username);
        UnderpostRootEnv.API.set('GITHUB_EMAIL', email);
        UnderpostRootEnv.API.get('GITHUB_USERNAME');
        UnderpostRootEnv.API.get('GITHUB_EMAIL');
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
      );

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
    promote: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      let [inputDeployId, inputEnv, inputReplicas] = path.split(',');
      if (!inputEnv) inputEnv = 'production';
      if (!inputReplicas) inputReplicas = 1;
      if (inputDeployId === 'dd') {
        for (const deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
          const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace });
          const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
          UnderpostDeploy.API.switchTraffic(deployId, inputEnv, targetTraffic, inputReplicas);
        }
      } else {
        const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(inputDeployId, { namespace: options.namespace });
        const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
        UnderpostDeploy.API.switchTraffic(inputDeployId, inputEnv, targetTraffic, inputReplicas);
      }
    },
    /**
     * @method metrics
     * @description Deploys Prometheus and Grafana for metrics monitoring, targeting the hosts defined in the deployment configuration files.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    metrics: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    cluster: async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      shellCd(`/home/dd/engine`);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --reset`);
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm`);
      await timer(5000);
      let [runtimeImage, deployList] = path.split(',')
        ? path.split(',')
        : ['lampp', fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').replaceAll(',', '+')];
      shellExec(
        `${baseCommand} dockerfile-pull-base-images${baseClusterCommand}${
          runtimeImage ? ` --path /home/dd/engine/src/runtime/${runtimeImage}` : ''
        } --kubeadm-load`,
      );
      if (!deployList) {
        deployList = [];
        logger.warn('No deploy list provided');
      } else deployList = deployList.split('+');
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm --pull-image --mongodb`);
      if (runtimeImage === 'lampp') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm --pull-image --mariadb`);
      }
      await timer(5000);
      for (const deployId of deployList) {
        shellExec(`${baseCommand} db ${deployId} --import --git`);
      }
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm --pull-image --valkey`);
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm --contour`);
      if (env === 'production') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --kubeadm --cert-manager`);
      }
      for (const deployId of deployList) {
        shellExec(
          `${baseCommand} deploy ${deployId} ${env} --kubeadm${env === 'production' ? ' --cert' : ''}${
            env === 'development' ? ' --etc-hosts' : ''
          }`,
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
    deploy: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const deployId = path;
      const { validVersion } = UnderpostRepository.API.privateConfUpdate(deployId);
      if (!validVersion) throw new Error('Version mismatch');
      const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace });
      const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
      const env = 'production';
      const ignorePods = UnderpostDeploy.API.get(`${deployId}-${env}-${targetTraffic}`).map((p) => p.NAME);

      shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${targetTraffic} -n ${options.namespace}`);

      await UnderpostDeploy.API.monitorReadyRunner(deployId, env, targetTraffic, ignorePods);

      UnderpostDeploy.API.switchTraffic(deployId, env, targetTraffic);
    },

    /**
     * @method dev
     * @description Starts development servers for client, API, and proxy based on provided parameters (deployId, host, path, clientHostPort).
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,subConf,host,path,clientHostPort`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    dev: async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
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
      shellExec(`node bin run dev-cluster --expose`, { async: true });
      {
        const cmd = `npm run dev-api ${deployId} ${subConf} ${host} ${_path} ${clientHostPort}${options.tls ? ' tls' : ''}`;
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
      shellExec(`npm run dev-proxy ${deployId} ${subConf} ${host} ${_path}${options.tls ? ' tls' : ''}`);
    },

    /**
     * @method service
     * @description Deploys and exposes specific services (like `mongo-express-service`) on the cluster, updating deployment configurations and monitoring status.
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,serviceId,host,path,replicas,image,node`).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    service: async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      shellCd(`/home/dd/engine`);
      let [deployId, serviceId, host, _path, replicas, image, node] = path.split(',');
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
      const success = await UnderpostTest.API.statusMonitor(podToMonitor);
      if (success) {
        const versions = UnderpostDeploy.API.getCurrentTraffic(deployId, { namespace: options.namespace }) || 'blue';
        if (!node) node = os.hostname();
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''} --build-manifest --sync --info-router --replicas ${
            replicas ? replicas : 1
          } --node ${node}${image ? ` --image ${image}` : ''}${versions ? ` --versions ${versions}` : ''} dd ${env}`,
        );
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''} --disable-update-deployment ${deployId} ${env} --versions ${versions}`,
        );
      } else logger.error('Mongo Express deployment failed');
      if (options.etcHosts === true) {
        const hostListenResult = UnderpostDeploy.API.etcHostFactory([host]);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method sh
     * @description Enables remote control for the Kitty terminal emulator.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sh: async (path = '', options = UnderpostRun.DEFAULT_OPTION) => {
      let [operator, arg0, arg1] = path.split(',');
      if (operator == 'copy') {
        shellExec(
          `kitty @ get-text ${arg0 === 'all' ? '--match all' : '--self'} --extent all${arg1 === 'ansi' ? ' --ansi yes' : ''} | kitty +kitten clipboard`,
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
    log: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const [filePath, keywords, lines] = path.split(',');
      let result = shellExec(`grep -i -E ${lines ? `-C ${lines} ` : ''}'${keywords}' ${filePath}`, {
        stdout: true,
        silent: true,
      }).replaceAll(`--`, `==============================`.green.bold);
      for (const keyword of keywords.split('|')) result = result.replaceAll(keyword, keyword.bgYellow.black.bold);
      console.log(result);
    },

    /**
     * @method release-cmt
     * @description Commits and pushes a new release for the `engine` repository with a message indicating the new version.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'release-cmt': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`underpost run pull`);
      shellExec(`underpost run secret`);
      shellCd(`/home/dd/engine`);
      shellExec(`underpost cmt --empty . ci engine ' New engine release $(underpost --version)'`);
      shellExec(`underpost push . ${process.env.GITHUB_USERNAME}/engine`);
    },

    /**
     * @method sync-replica
     * @description Syncs a replica for the dd.router
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'sync-replica': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
    'tf-vae-test': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      const podName = 'tf-vae-test';
      await UnderpostRun.RUNNERS['deploy-job']('', {
        podName,
        // volumeMountPath: '/custom_images',
        // volumeHostPath: '/home/dd/engine/src/client/public/cyberia/assets/skin',
        on: {
          init: async () => {
            openTerminal(`node bin run --dev monitor ${podName}`);
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
     * @method deploy-job
     * @description Creates and applies a custom Kubernetes Pod manifest (Job) for running arbitrary commands inside a container image (defaulting to a TensorFlow/NVIDIA image).
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional script path or job argument).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'deploy-job': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
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
      const kind = options.kind || 'Pod';
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

      const envs = UnderpostRootEnv.API.list();

      const cmd = `kubectl apply -f - <<EOF
apiVersion: ${apiVersion}
kind: ${kind}
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
      command: ${JSON.stringify(options.command ? options.command : ['/bin/bash', '-c'])}
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
    ? UnderpostDeploy.API.volumeFactory([{ volumeMountPath, volumeName, volumeHostPath, volumeType, claimName }]).render
    : ''
}
EOF`;
      shellExec(`kubectl delete pod ${podName} -n ${namespace} --ignore-not-found`);
      console.log(cmd);
      shellExec(cmd, { disableLog: true });
      const successInstance = await UnderpostTest.API.statusMonitor(podName);
      if (successInstance) {
        options.on?.init ? await options.on.init() : null;
        shellExec(`kubectl logs -f ${podName} -n ${namespace}`);
      }
    },
  };

  static API = {
    /**
     * @method callback
     * @description Initiates the execution of a specified CLI command (runner) with the given input value (`path`) and processed options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Promise<any>} The result of the callback execution.
     */
    async callback(runner, path, options = UnderpostRun.DEFAULT_OPTION) {
      try {
        const npmRoot = getNpmRootPath();
        const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
        if (options.command) options.command = options.command.split(',');
        if (options.args) options.args = options.args.split(',');
        if (!options.underpostRoot) options.underpostRoot = underpostRoot;
        if (!options.namespace) options.namespace = 'default';
        options.npmRoot = npmRoot;
        logger.info('callback', { path, options });
        if (!(runner in UnderpostRun.RUNNERS)) throw new Error(`Runner not found: ${runner}`);
        const result = await UnderpostRun.RUNNERS[runner](path, options);
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
