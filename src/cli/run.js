import dotenv from 'dotenv';
import { pbcopy, shellCd, shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostRootEnv from './env.js';
import read from 'read';

class UnderpostRun {
  static API = {
    async callback(path, options = {}) {
      const fileName = path.split('/').pop();

      switch (fileName) {
        case 'spark-template': {
          const path = '/home/dd/spark-template';
          shellExec(`sudo rm -rf ${path}`);
          shellCd('/home/dd');

          pbcopy(`cd /home/dd && sbt new underpostnet/spark-template.g8`);
          await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
          shellCd(path);

          shellExec(`git init && git add . && git commit -m "Base implementation"`);
          shellExec(`chmod +x ./replace_params.sh`);
          shellExec(`chmod +x ./build.sh`);

          shellExec(`./replace_params.sh`);
          shellExec(`./build.sh`);

          shellCd('/home/dd/engine');
          break;
        }
        case 'gpu': {
          shellExec(
            `node bin cluster --dev --reset && node bin cluster --dev --dedicated-gpu --kubeadm && kubectl get pods --all-namespaces -o wide -w`,
          );
          break;
        }
        case 'tf':
          shellExec(`kubectl apply -f manifests/deployment/tensorflow/tf-gpu-test.yaml`);
          break;
      }
    },
  };
}

export default UnderpostRun;
