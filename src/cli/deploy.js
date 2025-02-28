import { shellExec } from '../server/process.js';

class UnderpostDeploy {
  static API = {
    callback: (deployList = 'default', env = 'development') => {
      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
      }
    },
    getPods(deployId) {
      const raw = shellExec(`sudo kubectl get pods --all-namespaces -o wide`, {
        stdout: true,
        disableLog: false,
        silent: true,
      });

      const heads = raw
        .split(`\n`)[0]
        .split(' ')
        .filter((_r) => _r.trim());

      const pods = raw
        .split(`\n`)
        .filter((r) => (deployId ? r.match(deployId) : r.trim() && !r.match('NAME')))
        .map((r) => r.split(' ').filter((_r) => _r.trim()));

      const result = [];

      for (const row of pods) {
        const pod = {};
        let index = -1;
        for (const head of heads) {
          index++;
          pod[head] = row[index];
        }
        result.push(pod);
      }

      return result;
    },
  };
}

export default UnderpostDeploy;
