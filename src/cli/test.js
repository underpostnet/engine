import { timer } from '../client/components/core/CommonJs.js';
import { MariaDB } from '../db/mariadb/MariaDB.js';
import { getNpmRootPath } from '../server/conf.js';
import { actionInitLog, loggerFactory, setUpInfo } from '../server/logger.js';
import { pbcopy, shellExec } from '../server/process.js';
import UnderpostDeploy from './deploy.js';

const logger = loggerFactory(import.meta);

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
     * @memberof Underpost
     */
    async setUpInfo() {
      return await setUpInfo(logger);
    },
    run() {
      actionInitLog();
      shellExec(`cd ${getNpmRootPath()}/underpost && npm run test`);
    },
    async callback(deployList = '', options = { itc: false, sh: false, logs: false }) {
      if (
        options.podName &&
        typeof options.podName === 'string' &&
        options.podStatus &&
        typeof options.podStatus === 'string'
      )
        return await UnderpostTest.API.statusMonitor(options.podName, options.podStatus, options.kindType);

      if (options.sh === true || options.logs === true) {
        const [pod] = UnderpostDeploy.API.get(deployList);
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
            const pods = UnderpostDeploy.API.get(deployId);
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
      } else return UnderpostTest.API.run();
    },
    statusMonitor(podName, status = 'Running', kindType = '', deltaMs = 1000, maxAttempts = 60 * 5) {
      if (!(kindType && typeof kindType === 'string')) kindType = 'pods';
      return new Promise(async (resolve) => {
        let index = 0;
        logger.info(`Loading instance`, { podName, status, kindType, deltaMs, maxAttempts });
        const _monitor = async () => {
          await timer(deltaMs);
          const pods = UnderpostDeploy.API.get(podName, kindType);
          const result = pods.find((p) => p.STATUS === status);
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
