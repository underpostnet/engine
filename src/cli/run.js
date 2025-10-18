/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, openTerminal, pbcopy, shellCd, shellExec } from '../server/process.js';
import { getNpmRootPath, isDeployRunnerContext } from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import UnderpostTest from './test.js';
import fs from 'fs-extra';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';
import UnderpostDeploy from './deploy.js';
import UnderpostRootEnv from './env.js';
import UnderpostRepository from './repository.js';
import os from 'os';
import Underpost from '../index.js';

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
   * @memberof UnderpostRun
   */
  static DEFAULT_OPTION = {
    dev: false,
    podName: '',
    volumeHostPath: '',
    volumeMountPath: '',
    imageName: '',
    containerName: '',
    namespace: '',
    build: false,
    replicas: 1,
    k3s: false,
    kubeadm: false,
    force: false,
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
     * @description Kills the process running on the specified port by finding its PID using `lsof -t -i:${path}`.
     * @param {string} path - The input value, identifier, or path for the operation (used as the port number).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    kill: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`sudo kill -9 $(lsof -t -i:${path})`);
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
    'underpost-config': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      UnderpostDeploy.API.configMap(path ?? 'production');
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
      const { underpostRoot } = options;
      shellExec(`kubectl delete configmap tf-gpu-test-script`);
      shellExec(`kubectl delete pod tf-gpu-test-pod`);
      shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml`);
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
      if (path !== 'expose') {
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --reset`);
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''}`);

        shellExec(
          `${baseCommand} cluster${options.dev ? ' --dev' : ''} --mongodb --mongo-db-host ${mongoHosts.join(
            ',',
          )} --pull-image`,
        );
        shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --valkey --pull-image`);
      }
      shellExec(`${baseCommand} deploy --expose mongo`, { async: true });
      shellExec(`${baseCommand} deploy --expose valkey`, { async: true });
      {
        const hostListenResult = UnderpostDeploy.API.etcHostFactory(mongoHosts);
        logger.info(hostListenResult.renderHosts);
      }
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
     * @method cyberia-ide
     * @description Starts the development environment (IDE) for both `cyberia-server` and `cyberia-client` repositories.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'cyberia-ide': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run ide /home/dd/cyberia-server`);
      shellExec(`${baseCommand} run ide /home/dd/cyberia-client`);
    },
    /**
     * @method engine-ide
     * @description Starts the development environment (IDE) for the `engine` and `engine-private` repositories.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'engine-ide': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run ide /home/dd/engine`);
      shellExec(`${baseCommand} run ide /home/dd/engine/engine-private`);
    },
    /**
     * @method cluster-build
     * @description Build configuration for cluster deployment.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'cluster-build': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`node bin run clean`);
      shellExec(`node bin run --dev sync-replica template-deploy`);
      shellExec(`node bin run sync-replica template-deploy`);
      shellExec(`node bin env clean`);
      shellExec(`git add . && underpost cmt . build cluster-build`);
      shellExec(`cd engine-private && git add . && underpost cmt . build cluster-build`);
    },
    /**
     * @method template-deploy
     * @description Cleans up, pushes `engine-private` and `engine` repositories with a commit tag `ci package-pwa-microservices-template`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run clean`);
      shellExec(`${baseCommand} push ./engine-private ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine-private`);
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(`${baseCommand} cmt . --empty ci package-pwa-microservices-template`);
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
     * @description Cleans the core repository and pulls the latest content for `engine` and `engine-private` repositories from the remote.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    pull: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellCd(`/home/dd/engine`);
      shellExec(`node bin/deploy clean-core-repo`);
      shellExec(`underpost pull . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`underpost pull ./engine-private ${process.env.GITHUB_USERNAME}/engine-private`);
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
     * @description Opens a Visual Studio Code (VS Code) session for the specified path using `node ${underpostRoot}/bin/zed ${path}`.
     * @param {string} path - The input value, identifier, or path for the operation (used as the path to the directory to open in the IDE).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ide: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`node ${underpostRoot}/bin/zed ${path}`);
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

      if (isDeployRunnerContext(path, options)) {
        const { validVersion } = UnderpostRepository.API.privateConfUpdate(deployId);
        if (!validVersion) throw new Error('Version mismatch');
      }

      const currentTraffic = isDeployRunnerContext(path, options)
        ? UnderpostDeploy.API.getCurrentTraffic(deployId)
        : '';
      let targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : '';
      if (targetTraffic) versions = targetTraffic;

      shellExec(
        `${baseCommand} deploy --kubeadm --build-manifest --sync --info-router --replicas ${
          replicas ?? 1
        } --node ${node}${image ? ` --image ${image}` : ''}${versions ? ` --versions ${versions}` : ''} dd ${env}`,
      );

      if (isDeployRunnerContext(path, options)) {
        shellExec(`${baseCommand} deploy --kubeadm --disable-update-proxy ${deployId} ${env} --versions ${versions}`);
        if (!targetTraffic) targetTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId);
        await UnderpostDeploy.API.monitorReadyRunner(deployId, env, targetTraffic);
        UnderpostDeploy.API.switchTraffic(deployId, env, targetTraffic);
      } else logger.info('current traffic', UnderpostDeploy.API.getCurrentTraffic(deployId));
    },
    /**
     * @method ls-deployments
     * @description Retrieves and logs a table of Kubernetes deployments using `UnderpostDeploy.API.get`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional deployment name filter).
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      console.table(await UnderpostDeploy.API.get(path, 'deployments'));
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
                const nameSpace = 'default';
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

      shellExec(`kubectl delete deployment adminer`);
      shellExec(`kubectl apply -k ${underpostRoot}/manifests/deployment/adminer/.`);
      const successInstance = await UnderpostTest.API.statusMonitor('adminer', 'Running', 'pods', 1000, 60 * 10);

      if (successInstance) {
        shellExec(`underpost deploy --expose adminer`);
      }
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
          const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId);
          const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
          UnderpostDeploy.API.switchTraffic(deployId, inputEnv, targetTraffic, inputReplicas);
        }
      } else {
        const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(inputDeployId);
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
      const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId);
      const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
      const env = 'production';
      const ignorePods = UnderpostDeploy.API.get(`${deployId}-${env}-${targetTraffic}`).map((p) => p.NAME);

      shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${targetTraffic}`);

      await UnderpostDeploy.API.monitorReadyRunner(deployId, env, targetTraffic, ignorePods);

      UnderpostDeploy.API.switchTraffic(deployId, env, targetTraffic);
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
        for (const host of Object.keys(confServer)) {
          if (!(_path in confServer[host])) continue;
          shellExec(`node bin/deploy build-single-replica ${deployId} ${host} ${_path}`);
          shellExec(`node bin/deploy build-full-client ${deployId}`);
          const node = options.dev || !isDeployRunnerContext(path, options) ? 'kind-control-plane' : os.hostname();
          // deployId, replicas, versions, image, node
          let defaultPath = [deployId, 1, ``, ``, node];
          shellExec(`${baseCommand} run${options.dev === true ? ' --dev' : ''} --build sync ${defaultPath}`);
        }
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
      const args = (options.args ? options.args : path ? [`python ${path}`] : []).filter((c) => c.trim());
      const imageName = options.imageName || 'nvcr.io/nvidia/tensorflow:24.04-tf2-py3';
      const containerName = options.containerName || `${podName}-container`;
      const gpuEnable = imageName.match('nvidia');
      const runtimeClassName = gpuEnable ? 'nvidia' : '';
      const namespace = options.namespace || 'default';
      const volumeMountPath = options.volumeMountPath || path;
      const volumeHostPath = options.volumeHostPath || path;
      const enableVolumeMount = volumeHostPath && volumeMountPath;

      if (options.volumeType === 'dev') options.volumeType = 'FileOrCreate';
      const volumeType =
        options.volumeType || (enableVolumeMount && fs.statSync(volumeHostPath).isDirectory()) ? 'Directory' : 'File';

      const envs = UnderpostRootEnv.API.list();

      const cmd = `kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${namespace}
spec:
  restartPolicy: Never
${runtimeClassName ? `  runtimeClassName: ${runtimeClassName}` : ''}
  containers:
    - name: ${containerName}
      image: ${imageName}
      imagePullPolicy: IfNotPresent
      tty: true
      stdin: true
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
    ? `
      volumeMounts:
        - name: ${volumeName}
          mountPath: ${volumeMountPath}
  volumes:
    - name: ${volumeName}
      hostPath:
        path: ${volumeHostPath}
        type: ${volumeType}`
    : ''
}
EOF`;
      shellExec(`kubectl delete pod ${podName}`);
      console.log(cmd);
      shellExec(cmd, { disableLog: true });
      const successInstance = await UnderpostTest.API.statusMonitor(podName);
      if (successInstance) {
        options.on?.init ? await options.on.init() : null;
        shellExec(`kubectl logs -f ${podName}`);
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
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.command) options.command = options.command.split(',');
      if (options.args) options.args = options.args.split(',');
      options.underpostRoot = underpostRoot;
      options.npmRoot = npmRoot;
      logger.info('callback', { path, options });
      const result = await UnderpostRun.RUNNERS[runner](path, options);
      return result;
    },
  };
}

export default UnderpostRun;
