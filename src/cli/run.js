import { pbcopy, shellCd, shellExec } from '../server/process.js';
import read from 'read';
import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostTest from './test.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostRun {
  static DEFAULT_OPTION = { dev: false };
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
    'single-job': async (path, options = UnderpostRun.DEFAULT_OPTION) => {
      const podName = 'single-job';
      const volumeName = 'single-job-volume';
      const args = (options.args ? options.args : path ? [`python ${path}`] : []).filter((c) => c.trim());

      const cmd = `kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: default
spec:
  restartPolicy: Never
  runtimeClassName: nvidia
  containers:
    - name: tensorflow-gpu-tester
      image: nvcr.io/nvidia/tensorflow:24.04-tf2-py3
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
      resources:
        limits:
          nvidia.com/gpu: '1'
      env:
        - name: NVIDIA_VISIBLE_DEVICES
          value: all
${
  path
    ? `
      volumeMounts:
        - name: ${volumeName}
          mountPath: ${path}
  volumes:
    - name: ${volumeName}
      hostPath:
        path: ${path}
        type: ${fs.statSync(path).isDirectory() ? 'Directory' : 'File'}`
    : ''
}
EOF`;
      shellExec(`kubectl delete pod ${podName}`);
      console.log(cmd);
      shellExec(cmd, { disableLog: true });
      const successInstance = await UnderpostTest.API.statusMonitor(podName);
      if (successInstance) {
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
