/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, openTerminal, pbcopy, shellCd, shellExec } from '../server/process.js';
import read from 'read';
import { getNpmRootPath } from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import UnderpostTest from './test.js';
import fs from 'fs-extra';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';
import UnderpostDeploy from './deploy.js';
import UnderpostRootEnv from './env.js';
import UnderpostRepository from './repository.js';
import os from 'os';

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
     * @description Creates a new Spark template project.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Removes all podman images.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    rmi: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`podman rmi $(podman images -qa) --force`);
    },
    /**
     * @method kill
     * @description Kills a process by its port.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    kill: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(`sudo kill -9 $(lsof -t -i:${path})`);
    },
    /**
     * @method secret
     * @description Creates a new secret from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'underpost-config': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      UnderpostDeploy.API.configMap(path ?? 'production');
    },
    /**
     * @method gpu-env
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-cluster': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --reset`);
      shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''}`);
      const mongoHosts = ['mongodb-0.mongodb-service'];
      shellExec(
        `${baseCommand} cluster${options.dev ? ' --dev' : ''} --mongodb --mongo-db-host ${mongoHosts.join(
          ',',
        )} --pull-image`,
      );
      shellExec(`${baseCommand} cluster${options.dev ? ' --dev' : ''} --valkey --pull-image`);
      shellExec(`${baseCommand} deploy --expose mongo`, { async: true });
      shellExec(`${baseCommand} deploy --expose valkey`, { async: true });
      {
        const hostListenResult = UnderpostDeploy.API.etcHostFactory(mongoHosts);
        logger.info(hostListenResult.renderHosts);
      }
    },
    /**
     * @method ssh-cluster-info
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-cluster-info': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/ssh-cluster-info.sh`);
      shellExec(`${underpostRoot}/scripts/ssh-cluster-info.sh`);
    },
    /**
     * @method cyberia-ide
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'engine-ide': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run ide /home/dd/engine`);
      shellExec(`${baseCommand} run ide /home/dd/engine/engine-private`);
    },
    /**
     * @method template-deploy
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const baseCommand = options.dev || true ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run clean`);
      shellExec(`${baseCommand} push ./engine-private ${process.env.GITHUB_USERNAME}/engine-private`);
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(`${baseCommand} cmt . --empty ci package-pwa-microservices-template`);
      shellExec(`${baseCommand} push . ${process.env.GITHUB_USERNAME}/engine`);
    },
    /**
     * @method clean
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    clean: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellCd(path ?? `/home/dd/engine`);
      shellExec(`node bin/deploy clean-core-repo`);
    },
    /**
     * @method pull
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      actionInitLog();
      const baseCommand = options.dev || true ? 'node bin' : 'underpost';
      shellCd('/home/dd/engine');
      shellExec(`git reset`);
      shellExec(`${baseCommand} cmt . --empty cd ssh-${path}`);
      shellExec(`${baseCommand} push . ${process.env.GITHUB_USERNAME}/engine`);
    },
    /**
     * @method ide
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ide: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`node ${underpostRoot}/bin/vs ${path}`);
    },
    /**
     * @method sync
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sync: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev || true ? 'node bin' : 'underpost';
      shellExec(`${baseCommand} run clean`);
      const defaultPath = ['dd-default', 1, ``, ``, 'kind-control-plane'];
      let [deployId, replicas, versions, image, node] = path ? path.split(',') : defaultPath;
      deployId = deployId ?? defaultPath[0];
      replicas = replicas ?? defaultPath[1];
      versions = versions ?? defaultPath[2];
      image = image ?? defaultPath[3];
      node = node ?? defaultPath[4];
      shellExec(
        `${baseCommand} deploy --kubeadm --build-manifest --sync --info-router --replicas ${
          replicas ?? 1
        } --node ${node}${image ? ` --image ${image}` : ''}${
          versions ? ` --versions ${versions.replaceAll('+', ',')}` : ''
        } dd ${env}`,
      );
      if (!options.build) shellExec(`${baseCommand} deploy --kubeadm ${deployId} ${env}`);
    },
    /**
     * @method ls-deployments
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      console.table(await UnderpostDeploy.API.get(path, 'deployments'));
    },
    /**
     * @method monitor
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    cluster: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',');
      const env = 'production';
      shellCd(`/home/dd/engine`);
      shellExec(`underpost cluster --reset`);
      await timer(5000);
      shellExec(`underpost cluster --kubeadm`);
      await timer(5000);
      shellExec(`underpost dockerfile-pull-base-images --path /home/dd/engine/src/runtime/lampp --kubeadm-load`);
      await timer(5000);
      shellExec(`underpost cluster --kubeadm --pull-image --mongodb`);
      await timer(5000);
      shellExec(`underpost cluster --kubeadm --pull-image --mariadb`);
      await timer(5000);
      for (const deployId of deployList) {
        shellExec(`underpost db ${deployId} --import --git`);
      }
      await timer(5000);
      shellExec(`underpost cluster --kubeadm --pull-image --valkey`);
      await timer(5000);
      shellExec(`underpost cluster --kubeadm --contour`);
      await timer(5000);
      shellExec(`underpost cluster --kubeadm --cert-manager`);
      for (const deployId of deployList) {
        shellExec(`underpost deploy ${deployId} ${env} --kubeadm --cert`);
      }
    },
    /**
     * @method deploy
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
     * @param {Object} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    deploy: async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const deployId = path;
      const { validVersion, deployVersion } = UnderpostRepository.API.privateConfUpdate(deployId);
      if (!validVersion) throw new Error('Version mismatch');
      const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId);
      const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
      const env = 'production';
      const ignorePods = UnderpostDeploy.API.get(`${deployId}-${env}-${targetTraffic}`).map((p) => p.NAME);

      if (options.build === true) {
        // deployId, replicas, versions, image, node
        shellExec(
          `node bin run sync ${deployId},${options.replicas ?? 1},${targetTraffic},${
            options.imageName ?? `localhost/rockylinux9-underpost:${deployVersion}`
          },${os.hostname()}`,
        );
      } else shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${targetTraffic}`);

      let checkStatusIteration = 0;
      const checkStatusIterationMsDelay = 1000;
      const iteratorTag = `[${deployId}-${env}-${targetTraffic}]`;
      logger.info('Deployment init', { deployId, env, targetTraffic, checkStatusIterationMsDelay });
      const minReadyOk = 3;
      let readyOk = 0;

      while (readyOk < minReadyOk) {
        const ready = UnderpostDeploy.API.checkDeploymentReadyStatus(deployId, env, targetTraffic, ignorePods).ready;
        if (ready === true) {
          readyOk++;
          logger.info(`${iteratorTag} | Deployment ready. Verification number: ${readyOk}`);
        }
        await timer(checkStatusIterationMsDelay);
        checkStatusIteration++;
        logger.info(
          `${iteratorTag} | Deployment in progress... | Delay number check iterations: ${checkStatusIteration}`,
        );
      }

      logger.info(`${iteratorTag} | Deployment ready. | Total delay number check iterations: ${checkStatusIteration}`);

      UnderpostDeploy.API.switchTraffic(deployId, env, targetTraffic);

      // shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${currentTraffic}`);
    },
    /**
     * @method tf-vae-test
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Creates a new configmap from a file.
     * @param {string} path - The path to the directory where the template will be created.
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
     * @description Initiates a callback to a specified runner with the provided path and options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The path to the directory where the template will be created.
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
