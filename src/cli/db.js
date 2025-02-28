import { mergeFile } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostDB {
  static API = {
    async import(options = { import: 'default' }) {
      for (const _deployId of options.import.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const dbs = {};
        const repoName = `engine-${deployId.split('dd-')[1]}-cron-backups`;

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        for (const host of Object.keys(confServer)) {
          for (const path of Object.keys(confServer[host])) {
            const { db } = confServer[host][path];
            if (db) {
              const { provider, name, user, password } = db;
              if (!dbs[provider]) dbs[provider] = {};

              if (!(name in dbs[provider]))
                dbs[provider][name] = { user, password, hostFolder: host + path.replaceAll('/', '-') };
            }
          }
        }

        if (!fs.existsSync(`../${repoName}`)) {
          shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
        } else {
          shellExec(`cd ../${repoName} && underpost pull . ${process.env.GITHUB_USERNAME}/${repoName}`);
        }

        for (const provider of Object.keys(dbs)) {
          for (const dbName of Object.keys(dbs[provider])) {
            const { hostFolder, user, password } = dbs[provider][dbName];
            if (hostFolder) {
              logger.info('import', { hostFolder, provider, dbName });

              const backUpPath = `../${repoName}/${hostFolder}`;
              const times = await fs.readdir(backUpPath);
              const currentBackupTimestamp = Math.max(...times.map((t) => parseInt(t)));
              dbs[provider][dbName].currentBackupTimestamp = currentBackupTimestamp;

              const _fromPartsParts = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}-parths.json`;
              const _toSqlPath = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}.sql`;
              const _toBsonPath = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}`;

              if (fs.existsSync(_fromPartsParts) && !fs.existsSync(_toSqlPath)) {
                const names = JSON.parse(fs.readFileSync(_fromPartsParts, 'utf8')).map((_path) => {
                  return `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${_path.split('/').pop()}`;
                });
                logger.info('merge Back Up paths', {
                  _fromPartsParts,
                  _toSqlPath,
                  names,
                });
                await mergeFile(names, _toSqlPath);
              }

              switch (provider) {
                case 'mariadb': {
                  const podName = `mariadb-statefulset-0`;
                  const nameSpace = 'default';
                  const serviceName = 'mariadb';
                  shellExec(`sudo kubectl cp ${_toSqlPath} ${nameSpace}/${podName}:/${dbName}.sql`);
                  const cmd = `mariadb -u ${user} -p${password} ${dbName} < /${dbName}.sql`;
                  shellExec(
                    `kubectl exec -i ${podName} -- ${serviceName} -p${password} -e 'CREATE DATABASE ${dbName};'`,
                  );
                  shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                  break;
                }

                case 'mongoose': {
                  const podName = `mongodb-0`;
                  const nameSpace = 'default';
                  shellExec(`sudo kubectl cp ${_toBsonPath} ${nameSpace}/${podName}:/${dbName}`);
                  const cmd = `mongorestore -d ${dbName} /${dbName}`;
                  shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                  break;
                }

                default:
                  break;
              }
            }
          }
        }
      }
    },
  };
}

export default UnderpostDB;
