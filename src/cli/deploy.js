import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostDeploy {
  static API = {
    callback: (deployList = 'default', env = 'development', options = { remove: false }) => {
      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;

        shellExec(`sudo kubectl delete svc ${deployId}-${env}-service`);
        shellExec(`sudo kubectl delete deployment ${deployId}-${env}`);

        const etcHost = (
          concat,
        ) => `127.0.0.1  ${concat} localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6`;
        let concatHots = '';

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        for (const host of Object.keys(confServer)) {
          shellExec(`sudo kubectl delete HTTPProxy ${host}`);
          if (!options.remove === true && env === 'development') concatHots += ` ${host}`;
        }

        if (!options.remove === true) {
          shellExec(`sudo kubectl apply -f ./manifests/deployment/${deployId}-${env}/deployment.yaml`);
          shellExec(`sudo kubectl apply -f ./manifests/deployment/${deployId}-${env}/proxy.yaml`);
        }

        let renderHosts;

        switch (process.platform) {
          case 'linux':
            {
              switch (env) {
                case 'development':
                  renderHosts = etcHost(concatHots);
                  fs.writeFileSync(`/etc/hosts`, renderHosts, 'utf8');

                  break;

                default:
                  break;
              }
            }
            break;

          default:
            break;
        }
        logger.info(
          `
` + renderHosts,
        );
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
