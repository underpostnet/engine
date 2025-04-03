import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostDeploy from './deploy.js';
import axios from 'axios';
import UnderpostRootEnv from './env.js';
import fs from 'fs-extra';
import { shellExec } from '../server/process.js';

const logger = loggerFactory(import.meta);

class UnderpostMonitor {
  static API = {
    async callback(
      deployId,
      env = 'development',
      options = { now: false, single: false, msInterval: '', type: '' },
      auxRouter,
    ) {
      if (deployId === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`)) {
        for (const _deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','))
          UnderpostMonitor.API.callback(
            _deployId.trim(),
            env,
            options,
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

      logger.info(`${deployId} ${env}`, pathPortAssignmentData);

      let errorPayloads = [];
      let traffic = 'blue';
      const maxAttempts = Object.keys(pathPortAssignmentData)
        .map((host) => pathPortAssignmentData[host].length)
        .reduce((accumulator, value) => accumulator + value, 0);

      const monitor = async (reject) => {
        logger.info(`[${deployId}-${env}] Check server health`);
        for (const host of Object.keys(pathPortAssignmentData)) {
          for (const instance of pathPortAssignmentData[host]) {
            const { port, path } = instance;
            if (path.match('peer') || path.match('socket')) continue;
            let urlTest = `http://localhost:${port}${path}`;
            switch (options.type) {
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

                        if (traffic === 'blue') traffic = 'green';
                        else traffic = 'blue';

                        shellExec(
                          `node bin deploy --info-router --build-manifest --traffic ${traffic} ${deployId} ${env}`,
                        );

                        shellExec(`sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${env}/proxy.yaml`);
                        errorPayloads = [];
                      }

                      break;

                    default:
                      if (reject) reject(message);
                      else throw new Error(message);
                  }
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
      if (isNaN(optionsMsTimeout)) optionsMsTimeout = 30000;
      const monitorCallBack = (resolve, reject) => {
        const envMsTimeout = UnderpostRootEnv.API.get(`${deployId}-${env}-monitor-ms`);
        setTimeout(
          async () => {
            switch (UnderpostRootEnv.API.get(`${deployId}-${env}-monitor-input`)) {
              case 'pause':
                monitorCallBack(resolve, reject);
                return;
              case 'restart':
                return reject();
              case 'stop':
                return resolve();
              default:
                await monitor(reject);
                monitorCallBack(resolve, reject);
                return;
            }
          },
          !isNaN(envMsTimeout) ? envMsTimeout : optionsMsTimeout,
        );
      };
      return new Promise((...args) => monitorCallBack(...args));
    },
  };
}

export default UnderpostMonitor;
