import fs from 'fs';
// import read from 'read';
// import ncp from 'copy-paste';

import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { MariaDB } from '../src/db/mariadb/MariaDB.js';
import { Xampp } from '../src/runtime/xampp/Xampp.js';
import { Lampp } from '../src/runtime/lampp/Lampp.js';
import { loadConf } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, hostPath = '', operator, deployId, arg0, arg1] = process.argv;
const [host, path = ''] = hostPath.split('/');

try {
  let cmd;
  if (deployId) loadConf(deployId);
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const { provider, name, user, password = '', backupPath = '' } = confServer[host][`/${path}`].db;
  // logger.info('database', confServer[host][`/${path}`].db);
  switch (provider) {
    case 'mariadb':
      // https://www.cyberciti.biz/faq/how-to-show-list-users-in-a-mysql-mariadb-database/

      // Login:
      // mysql -u root -p
      // mysql -u root -h localhost -p mysql

      // Get Users:
      // SELECT host, user, password FROM mysql.user;

      // Get DB User:
      // SELECT User, Db, Host from mysql.db;

      // Change password:
      // ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY 'NEW_PASSWORD';
      // ALTER USER 'root'@'localhost' IDENTIFIED BY 'NEW_PASSWORD';
      // ALTER USER 'root'@'::1' IDENTIFIED BY 'NEW_PASSWORD';

      // Get all user privileges:
      // select * from information_schema.user_privileges;

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
        case 'select':
          await MariaDB.query({ user, password, query: `SELECT ${arg0} FROM ${name}.${arg1}` });
          break;
        case 'export':
          cmd = `mysqldump --column-statistics=0 -u ${user} -p ${name} > ${arg0 ? `${arg0}/${name}.sql` : backupPath}`;
          shellExec(cmd);
          break;
        case 'import':
          cmd = `mysql -u ${user} -p ${name} < ${backupPath}`;
          shellExec(cmd);
          break;
        case 'init-xampp-service':
          await Xampp.initService();
          break;
        case 'init-lampp-service':
          await Lampp.initService();
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
          shellExec(`mongodump -d ${name} -o ${arg0 ? arg0 : `./engine-private/mongodb-backup/`}`);
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

  // logger.info(`Run the following command`, cmd);
  // await ncp.copy(cmd);
  // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  // throw new Error(``);
} catch (error) {
  logger.error(error, error.stack);
}
