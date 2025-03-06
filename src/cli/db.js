import { mergeFile, splitFileFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostDB {
  static API = {
    async callback(deployList = 'default', options = { import: false, export: false, podName: false, ns: false }) {
      const newBackupTimestamp = new Date().getTime();
      const nameSpace = options.ns && typeof options.ns === 'string' ? options.ns : 'default';
      for (const _deployId of deployList.split(',')) {
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
              logger.info('', { hostFolder, provider, dbName });

              const backUpPath = `../${repoName}/${hostFolder}`;
              const times = await fs.readdir(backUpPath);
              const currentBackupTimestamp = Math.max(...times.map((t) => parseInt(t)));
              dbs[provider][dbName].currentBackupTimestamp = currentBackupTimestamp;
              const removeBackupTimestamp = Math.min(...times.map((t) => parseInt(t)));

              const sqlContainerPath = `/home/${dbName}.sql`;
              const _fromPartsParts = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}-parths.json`;
              const _toSqlPath = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}.sql`;
              const _toNewSqlPath = `../${repoName}/${hostFolder}/${newBackupTimestamp}/${dbName}.sql`;
              const _toBsonPath = `../${repoName}/${hostFolder}/${currentBackupTimestamp}/${dbName}`;
              const _toNewBsonPath = `../${repoName}/${hostFolder}/${newBackupTimestamp}/${dbName}`;

              if (options.import === true && fs.existsSync(_fromPartsParts) && !fs.existsSync(_toSqlPath)) {
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

              if (options.export === true && times.length >= 5) {
                fs.removeSync(`../${repoName}/${hostFolder}/${removeBackupTimestamp}`);
                fs.mkdirSync(`../${repoName}/${hostFolder}/${newBackupTimestamp}`, { recursive: true });
              }

              switch (provider) {
                case 'mariadb': {
                  const podName =
                    options.podName && typeof options.podName === 'string' ? options.podName : `mariadb-statefulset-0`;
                  const serviceName = 'mariadb';
                  if (options.import === true) {
                    shellExec(`sudo kubectl cp ${_toSqlPath} ${nameSpace}/${podName}:/${dbName}.sql`);
                    const cmd = `mariadb -u ${user} -p${password} ${dbName} < /${dbName}.sql`;
                    shellExec(
                      `kubectl exec -i ${podName} -- ${serviceName} -p${password} -e 'CREATE DATABASE ${dbName};'`,
                    );
                    shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                  }
                  if (options.export === true) {
                    const cmd = `mariadb-dump --user=${user} --password=${password} --lock-tables ${dbName} > ${sqlContainerPath}`;
                    shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                    shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${sqlContainerPath} ${_toNewSqlPath}`);
                    await splitFileFactory(dbName, _toNewSqlPath);
                  }
                  break;
                }

                case 'mongoose': {
                  if (options.import === true) {
                    const podName =
                      options.podName && typeof options.podName === 'string' ? options.podName : `mongodb-0`;
                    shellExec(`sudo kubectl cp ${_toBsonPath} ${nameSpace}/${podName}:/${dbName}`);
                    const cmd = `mongorestore -d ${dbName} /${dbName}`;
                    shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                  }
                  if (options.export === true) {
                    const podName = `backup-access`;
                    const containerBaseBackupPath = '/backup';
                    let timeFolder = shellExec(
                      `sudo kubectl exec -i ${podName} -- sh -c "cd ${containerBaseBackupPath} && ls -a"`,
                      {
                        stdout: true,
                        disableLog: false,
                        silent: true,
                      },
                    ).split(`\n`);
                    timeFolder = timeFolder[timeFolder.length - 2];
                    if (timeFolder === '..') {
                      logger.warn(`Cannot backup available`, { timeFolder });
                    } else {
                      shellExec(
                        `sudo kubectl cp ${nameSpace}/${podName}:${containerBaseBackupPath}/${timeFolder}/${dbName} ${_toNewBsonPath}`,
                      );
                    }
                  }
                  break;
                }

                default:
                  break;
              }
            }
          }
        }
        if (options.export === true) {
          shellExec(`cd ../${repoName} && git add .`);
          shellExec(
            `underpost cmt ../${repoName} backup '' '${new Date(newBackupTimestamp).toLocaleDateString()} ${new Date(
              newBackupTimestamp,
            ).toLocaleTimeString()}'`,
          );
          shellExec(`cd ../${repoName} && underpost push . ${process.env.GITHUB_USERNAME}/${repoName}`, {
            disableLog: true,
          });
        }
      }
    },
  };
}

export default UnderpostDB;
