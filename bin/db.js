import fs from 'fs-extra';
import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { MariaDB } from '../src/db/mariadb/MariaDB.js';
import { Xampp } from '../src/runtime/xampp/Xampp.js';
import { Lampp } from '../src/runtime/lampp/Lampp.js';
import { getCapVariableName, getRestoreCronCmd, loadConf } from '../src/server/conf.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { hashPassword } from '../src/server/auth.js';
import splitFile from 'split-file';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, hostPath = '', operator, deployId, arg0, arg1, arg2] = process.argv;
const [host, _path = ''] = hostPath.split('/');
const path = `/${_path}`;

try {
  let cmd;
  if (deployId) loadConf(deployId);
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const { runtime, db, git, client, directory } = confServer[host][path];
  const { provider, name, user, password = '', backupPath = '' } = db;
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
          {
            const cmdBackupPath = `${arg0 ? `${arg0}/${name}.sql` : backupPath}`;

            cmd = `mysqldump -u ${user} -p${password} ${name} > ${cmdBackupPath}`;
            shellExec(cmd);
            const stats = fs.statSync(cmdBackupPath);
            const maxSizeInBytes = 1024 * 1024 * 50; // 50 mb
            const fileSizeInBytes = stats.size;
            if (fileSizeInBytes > maxSizeInBytes) {
              await new Promise((resolve) => {
                splitFile
                  .splitFileBySize(cmdBackupPath, maxSizeInBytes) // 50 mb
                  .then((names) => {
                    fs.writeFileSync(
                      `${cmdBackupPath.split('/').slice(0, -1).join('/')}/${name}-parths.json`,
                      JSON.stringify(names, null, 4),
                      'utf8',
                    );
                    resolve();
                  })
                  .catch((err) => {
                    console.log('Error: ', err);
                    resolve();
                  });
              });
              fs.removeSync(cmdBackupPath);
            }
          }
          break;
        case 'import':
          shellExec(await getRestoreCronCmd({ host, path, conf: confServer, deployId }));
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
        case 'update':
          {
            await DataBaseProvider.load({ apis: [arg0], host, path, db });
            const models = DataBaseProvider.instance[`${host}${path}`].mongoose[getCapVariableName(arg0)];

            const select = JSON.parse(arg1.replaceAll("'", `"`));
            const update = JSON.parse(arg2.replaceAll("'", `"`));

            console.log({ models, select, update });

            switch (arg0) {
              case 'user':
                if (update.password) update.password = hashPassword(update.password);

              default:
                break;
            }
            let doc = await models.findOne(select);
            if (doc) {
              doc = await models.findByIdAndUpdate(doc._id, update, {
                runValidators: true,
              });
              logger.info(`successfully updated doc`, doc._doc);
            } else throw new Error(`no doc found`);
          }
          break;
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
          shellExec(await getRestoreCronCmd({ host, path, conf: confServer, deployId }));
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
