import { loggerFactory } from './server/logger.js';
import { shellExec } from './server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

// https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/

switch (process.platform) {
  case 'linux':
    {
      if (!process.argv.includes('server')) {
      }

      const files = await fs.readdir(`./`);

      let cmd = [];
      for (const file of files) {
        if (file.match('.yaml')) {
          cmd.push(file);
        }
      }
      // install env: kubectl, kubeadmin, kubelet, kompose.
      // local run minikube
      logger.info('->', `kompose convert`);
      logger.info('->', `kubectl apply -f ${cmd.join(',')}`);
    }

    break;

  default:
    break;
}
