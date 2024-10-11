import { shellExec } from './server/process.js';

// https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/

switch (process.platform) {
  case 'linux':
    {
      if (!process.argv.includes('server')) {
      }
    }

    break;

  default:
    break;
}
