import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostDeploy from './deploy.js';
import axios from 'axios';
import UnderpostRootEnv from './env.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostMonitor {
  static API = {
    async callback(deployId, env = 'development', options = { now: false, single: false, msInterval: '' }) {
      const router = await UnderpostDeploy.API.routerFactory(deployId, env);

      const confServer = loadReplicas(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
        'proxy',
      );

      const pathPortAssignmentData = pathPortAssignmentFactory(router, confServer);

      logger.info('', pathPortAssignmentData);

      const errorPayloads = [];
      const maxAttempts = Object.keys(pathPortAssignmentData)
        .map((host) => pathPortAssignmentData[host].length)
        .reduce((accumulator, value) => accumulator + value, 0);

      const monitor = async (reject) => {
        logger.info('Check server health');
        for (const host of Object.keys(pathPortAssignmentData)) {
          for (const instance of pathPortAssignmentData[host]) {
            const { port, path } = instance;
            if (path.match('peer') || path.match('socket')) continue;
            const urlTest = `http://localhost:${port}${path}`;
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
                  if (reject) reject(message);
                  else throw new Error(message);
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
        const envMsTimeout = UnderpostRootEnv.API.get('monitor-ms');
        setTimeout(
          async () => {
            switch (UnderpostRootEnv.API.get('monitor-input')) {
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
      return await new Promise((...args) => monitorCallBack(...args));
    },
  };
}

export default UnderpostMonitor;
