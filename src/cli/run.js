import { pbcopy, shellCd, shellExec } from '../server/process.js';
import read from 'read';
import { getNpmRootPath } from '../server/conf.js';

class UnderpostRun {
  static API = {
    async callback(path, options = { dev: false }) {
      const fileName = path.split('/').pop();
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      switch (fileName) {
        case 'spark-template': {
          const path = '/home/dd/spark-template';
          shellExec(`sudo rm -rf ${path}`);
          shellCd('/home/dd');

          // pbcopy(`cd /home/dd && sbt new underpostnet/spark-template.g8`);
          // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
          shellExec(`cd /home/dd && sbt new underpostnet/spark-template.g8 '--name=spark-template'`);

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
          shellExec(`kubectl delete configmap tf-gpu-test-script`);
          shellExec(`kubectl delete pod tf-gpu-test-pod`);
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml`);
          break;
      }
    },
  };
}

export default UnderpostRun;
