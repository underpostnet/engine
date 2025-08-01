import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostRootEnv from './env.js';

class UnderpostRun {
  static API = {
    callback(path, options = {}) {
      const fileName = path.split('/').pop();

      switch (fileName) {
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
