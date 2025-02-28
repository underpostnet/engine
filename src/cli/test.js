import { MariaDB } from '../db/mariadb/MariaDB.js';
import { getNpmRootPath } from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';

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
    async callback(deployList = 'default', options = { insideContainer: false }) {
      if (deployList) {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          switch (deployId) {
            case 'dd-lampp':
              {
                if (options.insideContainer === true) {
                  const { MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, DD_LAMPP_TEST_DB_0 } = process.env;

                  await MariaDB.query({
                    host: MARIADB_HOST,
                    user: MARIADB_USER,
                    password: MARIADB_PASSWORD,
                    query: `SHOW TABLES FROM ${DD_LAMPP_TEST_DB_0}`,
                  });
                } else {
                }
              }
              break;

            default:
              if (options.insideContainer === true) {
                shellExec('npm run test');
              } else {
              }
              break;
          }
        }
      } else return this.run();
    },
  };
}

export default UnderpostTest;
