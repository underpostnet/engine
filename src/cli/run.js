import { daemonProcess, getTerminalPid, openTerminal, pbcopy, shellCd, shellExec } from '../server/process.js';
import read from 'read';
import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostTest from './test.js';
import fs from 'fs-extra';
import { range, setPad, timer } from '../client/components/core/CommonJs.js';
import UnderpostDeploy from './deploy.js';

const logger = loggerFactory(import.meta);

class UnderpostRun {
  static DEFAULT_OPTION = {
    dev: false,
    podName: '',
    volumeHostPath: '',
    volumeMountPath: '',
    imageName: '',
    containerName: '',
    namespace: '',
  };
  static RUNNERS = {
    'spark-template': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const dir = '/home/dd/spark-template';
      shellExec(`sudo rm -rf ${dir}`);
      shellCd('/home/dd');

      // pbcopy(`cd /home/dd && sbt new underpostnet/spark-template.g8`);
      // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      shellExec(`cd /home/dd && sbt new underpostnet/spark-template.g8 '--name=spark-template'`);

      shellCd(dir);

      shellExec(`git init && git add . && git commit -m "Base implementation"`);
      shellExec(`chmod +x ./replace_params.sh`);
      shellExec(`chmod +x ./build.sh`);

      shellExec(`./replace_params.sh`);
      shellExec(`./build.sh`);

      shellCd('/home/dd/engine');
    },
    'gpu-env': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      shellExec(
        `node bin cluster --dev --reset && node bin cluster --dev --dedicated-gpu --kubeadm && kubectl get pods --all-namespaces -o wide -w`,
      );
    },
    'tf-gpu-test': (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`kubectl delete configmap tf-gpu-test-script`);
      shellExec(`kubectl delete pod tf-gpu-test-pod`);
      shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml`);
    },
    ide: (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`node ${underpostRoot}/bin/vs ${path}`);
    },
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
${
  gpuEnable
    ? `      resources:
        limits:
          nvidia.com/gpu: '1'
      env:
        - name: NVIDIA_VISIBLE_DEVICES
          value: all`
    : ''
}
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
        type: ${fs.statSync(volumeHostPath).isDirectory() ? 'Directory' : 'File'}`
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
