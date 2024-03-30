import fs from 'fs';
// import read from 'read';
// import ncp from 'copy-paste';

import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { MariaDB } from '../src/db/mariadb/MariaDB.js';
import { Xampp } from '../src/runtime/xampp/Xampp.js';
import { loadConf } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, hostPath = '', operator, deployId] = process.argv;
const [host, path = ''] = hostPath.split('/');

try {
  let cmd;
  if (deployId) loadConf(deployId);
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const { provider, name, user, password = '', backupPath = '' } = confServer[host][`/${path}`].db;
  logger.info('database', confServer[host][`/${path}`].db);
  switch (provider) {
    case 'mariadb':
      switch (operator) {
        case 'show-all':
          await MariaDB.query({ user, password, query: `SHOW DATABASES` });
          break;
        case 'show':
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
        case 'init-service':
          await Xampp.initService();
          break;
        default:
          break;
      }

      break;

    case 'mongoose':
      // MongoDB App Services CLI
      switch (operator) {
        case 'show-all':
          break;
        case 'show':
          break;
        case 'create':
          break;
        case 'delete':
          break;
        case 'export':
          // mongodump -d <database_name> -o <directory_backup>
          shellExec(`mongodump -d ${name} -o ./engine-private/mongodb-backup/`);
          break;
        case 'import':
          // mongorestore -d <database_name> <directory_backup>
          shellExec(`mongorestore -d ${name} ./engine-private/mongodb-backup/${name}`);
          break;
        case 'init-service':
          break;
        default:
          break;
      }
      break;

    default:
      break;
  }

  shellExec(`git checkout .`);

  // logger.info(`Run the following command`, cmd);
  // await ncp.copy(cmd);
  // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  // throw new Error(``);
} catch (error) {
  logger.error(error, error.stack);
}
