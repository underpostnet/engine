/**
 * Test module for running tests on the application.
 * @module src/cli/test.js
 * @namespace UnderpostTest
 */

import { timer } from '../client/components/core/CommonJs.js';
import { MariaDB } from '../db/mariadb/MariaDB.js';
import { getNpmRootPath } from '../server/conf.js';
import { actionInitLog, loggerFactory, setUpInfo } from '../server/logger.js';
import { pbcopy, shellExec } from '../server/process.js';
import Underpost from '../index.js';
const logger = loggerFactory(import.meta);

/**
 * @class UnderpostTest
 * @description Manages the test of the application.
 * @memberof UnderpostTest
 */
class UnderpostTest {
  static API = {
    /**
     * Logs information about the current process environment to the console.
     *
     * This function is used to log details about
     * the execution context, such as command-line arguments,
     * environment variables, the process's administrative privileges,
     * and the maximum available heap space size.
     *
     * @static
     * @method setUpInfo
     * @returns {Promise<void>}
     * @memberof UnderpostTest
     */
    async setUpInfo() {
      return await setUpInfo(logger);
    },
    /**
     * @method run
     * @description Runs the test of the application.
     * @memberof UnderpostTest
     */
    run() {
      actionInitLog();
      shellExec(`cd ${getNpmRootPath()}/underpost && npm run test`);
    },
    /**
     * @method callback
     * @description Manages the test of the application.
     * @param {string} deployList - The list of deployments to test.
     * @param {object} options - The options for the test.
     * @param {boolean} options.itc - If true, tests the inside container.
     * @param {boolean} options.sh - If true, tests the shell.
     * @param {boolean} options.logs - If true, tests the logs.
     * @param {string} options.podName - The name of the pod to test.
     * @param {string} options.podStatus - The status of the pod to test.
     * @param {string} options.kindType - The type of the kind to test.
     * @param {number} options.deltaMs - The delta time in milliseconds.
     * @param {number} options.maxAttempts - The maximum number of attempts.
     * @memberof UnderpostTest
     */
    async callback(deployList = '', options = { itc: false, sh: false, logs: false }) {
      if (
        options.podName &&
        typeof options.podName === 'string' &&
        options.podStatus &&
        typeof options.podStatus === 'string'
      )
        return await Underpost.test.statusMonitor(options.podName, options.podStatus, options.kindType);

      if (options.sh === true || options.logs === true) {
        const [pod] = Underpost.deploy.get(deployList);
        if (pod) {
          if (options.sh) return pbcopy(`sudo kubectl exec -it ${pod.NAME} -- sh`);
          if (options.logs) return shellExec(`sudo kubectl logs -f ${pod.NAME}`);
        }
        return logger.warn(`Couldn't find pods in deployment`, deployList);
      }
      if (deployList) {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          if (options.itc === true)
            switch (deployId) {
              case 'dd-lampp':
                {
                  const { MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, DD_LAMPP_TEST_DB_0 } = process.env;

                  await MariaDB.query({
                    host: MARIADB_HOST,
                    user: MARIADB_USER,
                    password: MARIADB_PASSWORD,
                    query: `SHOW TABLES FROM ${DD_LAMPP_TEST_DB_0}`,
                  });
                }
                break;

              default:
                {
                  shellExec('npm run test');
                }

                break;
            }
          else {
            const pods = Underpost.deploy.get(deployId);
            if (pods.length > 0)
              for (const deployData of pods) {
                const { NAME } = deployData;
                shellExec(
                  `sudo kubectl exec -i ${NAME} -- sh -c "cd /home/dd/engine && underpost test ${deployId} --inside-container"`,
                );
              }
            else logger.warn(`Couldn't find pods in deployment`, { deployId });
          }
        }
      } else return Underpost.test.run();
    },
    /**
     * @method statusMonitor
     * @description Monitors the status of a pod.
     * @param {string} podName - The name of the pod to monitor.
     * @param {string} status - The status of the pod to monitor.
     * @param {string} kindType - The type of the kind to monitor.
     * @param {number} deltaMs - The delta time in milliseconds.
     * @param {number} maxAttempts - The maximum number of attempts.
     * @memberof UnderpostTest
     */
    statusMonitor(podName, status = 'Running', kindType = '', deltaMs = 1000, maxAttempts = 60 * 5) {
      if (!(kindType && typeof kindType === 'string')) kindType = 'pods';
      return new Promise(async (resolve) => {
        let index = 0;
        logger.info(`Loading instance`, { podName, status, kindType, deltaMs, maxAttempts });
        const _monitor = async () => {
          await timer(deltaMs);
          const pods = Underpost.deploy.get(podName, kindType);
          let result = pods.find((p) => p.STATUS === status || (status === 'Running' && p.STATUS === 'Completed'));
          logger.info(
            `Testing pod ${podName}... ${result ? 1 : 0}/1 - elapsed time ${deltaMs * (index + 1)}s - attempt ${
              index + 1
            }/${maxAttempts}`,
            pods[0] ? pods[0].STATUS : 'Not found kind object',
          );
          if (result) return resolve(true);
          index++;
          if (index === maxAttempts) {
            logger.error(`Failed to test pod ${podName} within ${maxAttempts} attempts`);
            return resolve(false);
          }
          return _monitor();
        };
        await _monitor();
      });
    },
  };
}

export default UnderpostTest;
