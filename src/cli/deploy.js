import { buildPortProxyRouter, buildProxyRouter, Config, getDataDeploy } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

class UnderpostDeploy {
  static API = {
    async sync(deployList) {
      const deployGroupId = '_dd';
      fs.writeFileSync('./engine-private/deploy/_dd.json', JSON.stringify(deployList.split(',')), 'utf8');
      return getDataDeploy({
        buildSingleReplica: true,
        deployGroupId,
      });
    },
    async routerFactory(deployList, env) {
      const initEnvPath = `./engine-private/conf/${deployList.split(',')[0]}/.env.${env}`;
      const initEnvObj = dotenv.parse(fs.readFileSync(initEnvPath, 'utf8'));
      process.env.PORT = initEnvObj.PORT;
      process.env.NODE_ENV = env;
      await Config.build(undefined, 'proxy', deployList);
      return buildPortProxyRouter(env === 'development' ? 80 : 443, buildProxyRouter());
    },
    async callback(
      deployList = 'default',
      env = 'development',
      options = { remove: false, infoRouter: false, sync: false },
    ) {
      if (options.sync) UnderpostDeploy.API.sync(deployList);
      if (options.infoRouter === true)
        return logger.info('router', await UnderpostDeploy.API.routerFactory(deployList, env));

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
