import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostDeploy from './deploy.js';
import axios from 'axios';
import UnderpostRootEnv from './env.js';
import fs from 'fs-extra';
import { timer } from '../client/components/core/CommonJs.js';

const logger = loggerFactory(import.meta);

class UnderpostMonitor {
  static API = {
    async callback(deployId, env = 'development', options = { itc: false }) {
      const router = await UnderpostDeploy.API.routerFactory(deployId, env);

      const confServer = loadReplicas(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
        'proxy',
      );

      const pathPortAssignmentData = pathPortAssignmentFactory(router, confServer);

      logger.info('', pathPortAssignmentData);

      if (options.itc === true) {
        const errorPayloads = [];
        const maxAttempts = Object.keys(pathPortAssignmentData)
          .map((host) => pathPortAssignmentData[host].length)
          .reduce((accumulator, value) => accumulator + value, 0);

        const monitor = async () => {
          await timer(30000);
          if (UnderpostRootEnv.API.get('running-job')) return await monitor();
          for (const host of Object.keys(pathPortAssignmentData)) {
            for (const instance of pathPortAssignmentData[host]) {
              const { port, path } = instance;
              if (path.match('peer') || path.match('socket')) continue;
              const urlTest = `http://localhost:${port}${path}`;
              logger.info('Test instance', urlTest);
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
                  if (errorPayloads.length >= maxAttempts) throw new Error(JSON.stringify(errorPayloads, null, 4));
                  logger.error('Error accumulator', errorPayloads.length);
                }
              });
            }
          }
          await monitor();
        };
        await monitor();
      }
    },
  };
}

export default UnderpostMonitor;
