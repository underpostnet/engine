import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostDeploy from './deploy.js';
import axios from 'axios';
import UnderpostRootEnv from './env.js';
import fs from 'fs-extra';
import { shellExec } from '../server/process.js';
import { isInternetConnection } from '../server/dns.js';

const logger = loggerFactory(import.meta);

class UnderpostMonitor {
  static API = {
    async callback(
      deployId,
      env = 'development',
      options = { now: false, single: false, msInterval: '', type: '', replicas: '', sync: false },
      commanderOptions,
      auxRouter,
    ) {
      if (deployId === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`)) {
        for (const _deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','))
          UnderpostMonitor.API.callback(
            _deployId.trim(),
            env,
            options,
            commanderOptions,
            await UnderpostDeploy.API.routerFactory(_deployId, env),
          );
        return;
      }

      const router = auxRouter ?? (await UnderpostDeploy.API.routerFactory(deployId, env));

      const confServer = loadReplicas(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
        'proxy',
      );

      const pathPortAssignmentData = pathPortAssignmentFactory(router, confServer);

      let errorPayloads = [];
      if (options.sync === true) {
        const currentTraffic = UnderpostDeploy.API.getCurrentTraffic(deployId);
        if (currentTraffic) UnderpostRootEnv.API.set(`${deployId}-${env}-traffic`, currentTraffic);
      }
      let traffic = UnderpostRootEnv.API.get(`${deployId}-${env}-traffic`) ?? 'blue';
      const maxAttempts = parseInt(
        Object.keys(pathPortAssignmentData)
          .map((host) => pathPortAssignmentData[host].length)
          .reduce((accumulator, value) => accumulator + value, 0) * 2.5,
      );

      logger.info(`Init deploy monitor`, {
        pathPortAssignmentData,
        maxAttempts,
        deployId,
        env,
        traffic,
      });

      const switchTraffic = () => {
        if (traffic === 'blue') traffic = 'green';
        else traffic = 'blue';
        UnderpostRootEnv.API.set(`${deployId}-${env}-traffic`, traffic);
        shellExec(
          `node bin deploy --info-router --build-manifest --traffic ${traffic} --replicas ${
            options.replicas ? options.replicas : 1
          } ${deployId} ${env}`,
        );
        shellExec(`sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${env}/proxy.yaml`);
      };

      const monitor = async (reject) => {
        const currentTimestamp = new Date().getTime();
        errorPayloads = errorPayloads.filter((e) => currentTimestamp - e.timestamp < 60 * 1000 * 5);
        logger.info(`[${deployId}-${env}] Check server health`);
        for (const host of Object.keys(pathPortAssignmentData)) {
          for (const instance of pathPortAssignmentData[host]) {
            const { port, path } = instance;
            if (path.match('peer') || path.match('socket')) continue;
            let urlTest = `http://localhost:${port}${path}`;
            switch (options.type) {
              case 'remote':
              case 'blue-green':
                urlTest = `https://${host}${path}`;
                break;

              default:
                break;
            }
            // logger.info('Test instance', urlTest);
            await axios.get(urlTest, { timeout: 10000 }).catch((error) => {
              // console.log(error);
              const errorPayload = {
                urlTest,
                host,
                port,
                path,
                name: error.name,
                status: error.status,
                code: error.code,
                errors: error.errors,
                timestamp: new Date().getTime(),
              };
              if (errorPayload.status !== 404) {
                errorPayloads.push(errorPayload);
                if (errorPayloads.length >= maxAttempts) {
                  const message = JSON.stringify(errorPayloads, null, 4);
                  logger.error(
                    `Deployment ${deployId} ${env} has been reached max attempts error payloads`,
                    errorPayloads,
                  );
                  switch (options.type) {
                    case 'blue-green':
                      {
                        const confServer = JSON.parse(
                          fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'),
                        );

                        for (const host of Object.keys(confServer)) {
                          shellExec(`sudo kubectl delete HTTPProxy ${host}`);
                        }
                        shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${traffic}`);

                        switchTraffic();
                      }

                      break;

                    case 'remote':
                      break;

                    default:
                      if (reject) reject(message);
                      else throw new Error(message);
                  }
                  errorPayloads = [];
                }
                logger.error('Error accumulator', errorPayloads.length);
              }
            });
          }
        }
      };
      if (options.now === true) await monitor();
      if (options.single === true) return;
      let optionsMsTimeout = parseInt(options.msInterval);
      if (isNaN(optionsMsTimeout)) optionsMsTimeout = 60250; // 60.25 seconds
      let monitorTrafficName;
      let monitorPodName;
      const monitorCallBack = (resolve, reject) => {
        const envMsTimeout = UnderpostRootEnv.API.get(`${deployId}-${env}-monitor-ms`);
        setTimeout(
          async () => {
            const isOnline = await isInternetConnection();
            if (!isOnline) {
              logger.warn('No internet connection');
              monitorCallBack(resolve, reject);
              return;
            }
            switch (options.type) {
              case 'blue-green':
                {
                  if (monitorTrafficName !== traffic) {
                    monitorTrafficName = undefined;
                    monitorPodName = undefined;
                  }
                  const cmd = `underpost config get container-status`;
                  const checkDeploymentReadyStatus = () => {
                    const pods = UnderpostDeploy.API.get(`${deployId}-${env}-${traffic}`);
                    if (pods && pods[0]) {
                      const { NAME } = pods[0];
                      if (
                        shellExec(`sudo kubectl exec -i ${NAME} -- sh -c "${cmd}"`, { stdout: true }).match(
                          `${deployId}-${env}-running-deployment`,
                        )
                      ) {
                        monitorPodName = NAME;
                        monitorTrafficName = `${traffic}`;
                      }
                    }
                  };
                  if (!monitorPodName) {
                    checkDeploymentReadyStatus();
                    monitorCallBack(resolve, reject);
                    return;
                  }
                }

                break;

              default:
                break;
            }
            for (const monitorStatus of [
              { key: `monitor-input`, value: UnderpostRootEnv.API.get(`monitor-input`) },
              {
                key: `${deployId}-${env}-monitor-input`,
                value: UnderpostRootEnv.API.get(`${deployId}-${env}-monitor-input`),
              },
            ])
              switch (monitorStatus.value) {
                case 'pause':
                  monitorCallBack(resolve, reject);
                  return;
                case 'restart':
                  UnderpostRootEnv.API.delete(monitorStatus.key);
                  return reject();
                case 'stop':
                  UnderpostRootEnv.API.delete(monitorStatus.key);
                  return resolve();
                case 'blue-green-switch':
                  UnderpostRootEnv.API.delete(monitorStatus.key);
                  switchTraffic();
              }
            await monitor(reject);
            monitorCallBack(resolve, reject);
            return;
          },
          !isNaN(envMsTimeout) ? envMsTimeout : optionsMsTimeout,
        );
      };
      return new Promise((...args) => monitorCallBack(...args));
    },
  };
}

export default UnderpostMonitor;
