import fs from 'fs';
// import read from 'read';
// import ncp from 'copy-paste';

import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { MariaDB } from '../src/db/mariadb/mariadb.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, hostPath = '', operator] = process.argv;
const [host, path = ''] = hostPath.split('/');

try {
  let cmd;
  const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/conf.server.private.json`, 'utf8'));
  const { provider, name, user, password = '', backupPath = '' } = confServer[host][`/${path}`].db;
  switch (provider) {
    case 'mariadb':
      switch (operator) {
        case 'show':
          await MariaDB.query({ user, password, query: `SHOW DATABASES` });
          await MariaDB.query({ user, password, query: `SHOW TABLES FROM ${name}` });
          break;
        case 'create':
          await MariaDB.query({ user, password, query: `CREATE DATABASE ${name}` });
          break;
        case 'delete':
          await MariaDB.query({ user, password, query: `DROP DATABASE IF EXISTS ${name}` });
          break;
        case 'export':
          cmd = `mysqldump --column-statistics=0 -u ${user} -p ${name} > ${backupPath}`;
          shellExec(cmd);
          break;
        case 'import':
          cmd = `mysql -u ${user} -p ${name} < ${backupPath}`;
          shellExec(cmd);
          break;

        default:
          break;
      }

      break;

    default:
      break;
  }

  // logger.info(`Run the following command`, cmd);
  // await ncp.copy(cmd);
  // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  // throw new Error(``);
} catch (error) {
  logger.error(error, error.stack);
}
