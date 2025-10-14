/**
 * UnderpostDB CLI index module
 * @module src/cli/db.js
 * @namespace UnderpostDB
 */

import { mergeFile, splitFileFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostDeploy from './deploy.js';
import UnderpostCron from './cron.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostDB
 * @description Manages database operations and backups.
 * This class provides a set of static methods to handle database operations,
 * including importing and exporting data, managing database backups, and
 * handling database connections for different providers (e.g., MariaDB, MongoDB).
 * @memberof UnderpostDB
 */
class UnderpostDB {
  static API = {
    /**
     * @method callback
     * @description Initiates a database backup workflow based on the provided options.
     * This method orchestrates the backup process for multiple deployments, handling
     * database connections, backup storage, and optional Git integration for version control.
     * @param {string} [deployList='default'] - List of deployment IDs to include in the backup.
     * @param {object} [options] - An object containing boolean flags for various operations.
     * @param {boolean} [options.import=false] - Flag to import data from a backup.
     * @param {boolean} [options.export=false] - Flag to export data to a backup.
     * @param {string} [options.podName=false] - The name of the Kubernetes pod to use for database operations.
     * @param {string} [options.ns=false] - The namespace to use for database operations.
     * @param {string} [options.collections=''] - Comma-separated list of collections to include in the backup.
     * @param {string} [options.outPath=''] - Output path for the backup file.
     * @param {boolean} [options.drop=false] - Flag to drop the database before importing.
     * @param {boolean} [options.preserveUUID=false] - Flag to preserve UUIDs during import.
     * @param {boolean} [options.git=false] - Flag to enable Git integration for version control.
     * @param {string} [options.hosts=''] - Comma-separated list of hosts to include in the backup.
     * @param {string} [options.paths=''] - Comma-separated list of paths to include in the backup.
     * @memberof UnderpostDB
     */
    async callback(
      deployList = 'default',
      options = {
        import: false,
        export: false,
        podName: false,
        ns: false,
        collections: '',
        outPath: '',
        drop: false,
        preserveUUID: false,
        git: false,
        hosts: '',
        paths: '',
      },
    ) {
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
                dbs[provider][name] = { user, password, hostFolder: host + path.replaceAll('/', '-'), host, path };
            }
          }
        }

        if (options.git === true) {
          if (!fs.existsSync(`../${repoName}`)) {
            shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
          } else {
            shellExec(`cd ../${repoName} && git checkout . && git clean -f -d`);
            shellExec(`cd ../${repoName} && underpost pull . ${process.env.GITHUB_USERNAME}/${repoName}`);
          }
        }

        for (const provider of Object.keys(dbs)) {
          for (const dbName of Object.keys(dbs[provider])) {
            const { hostFolder, user, password, host, path } = dbs[provider][dbName];
            if (
              (options.hosts && !options.hosts.split(',').includes(host)) ||
              (options.paths && !options.paths.split(',').includes(path))
            )
              continue;
            if (hostFolder) {
              logger.info('', { hostFolder, provider, dbName });

              const backUpPath = `../${repoName}/${hostFolder}`;
              if (!fs.existsSync(backUpPath)) fs.mkdirSync(backUpPath, { recursive: true });
              shellExec(`cd ${backUpPath} && find . -type d -empty -delete`); // delete empty folders
              const times = await fs.readdir(backUpPath);
              const currentBackupTimestamp = Math.max(...times.map((t) => parseInt(t)).filter((t) => !isNaN(t)));
              dbs[provider][dbName].currentBackupTimestamp = currentBackupTimestamp;
              const removeBackupTimestamp = Math.min(...times.map((t) => parseInt(t)).filter((t) => !isNaN(t)));

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
                logger.info('remove', `../${repoName}/${hostFolder}/${removeBackupTimestamp}`);
                fs.removeSync(`../${repoName}/${hostFolder}/${removeBackupTimestamp}`);
                logger.info('create', `../${repoName}/${hostFolder}/${newBackupTimestamp}`);
                fs.mkdirSync(`../${repoName}/${hostFolder}/${newBackupTimestamp}`, { recursive: true });
              }

              switch (provider) {
                case 'mariadb': {
                  const podNames =
                    options.podName && typeof options.podName === 'string'
                      ? options.podName.split(',')
                      : UnderpostDeploy.API.get('mariadb'); // `mariadb-statefulset-0`;
                  const serviceName = 'mariadb';
                  for (const podNameData of [podNames[0]]) {
                    const podName = podNameData.NAME;
                    if (options.import === true) {
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf /${dbName}.sql"`);
                      shellExec(`sudo kubectl cp ${_toSqlPath} ${nameSpace}/${podName}:/${dbName}.sql`);
                      const cmd = `mariadb -u ${user} -p${password} ${dbName} < /${dbName}.sql`;
                      shellExec(
                        `kubectl exec -i ${podName} -- ${serviceName} -p${password} -e 'CREATE DATABASE ${dbName};'`,
                      );
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                    }
                    if (options.export === true) {
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf ${sqlContainerPath}"`);
                      const cmd = `mariadb-dump --user=${user} --password=${password} --lock-tables ${dbName} > ${sqlContainerPath}`;
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                      shellExec(
                        `sudo kubectl cp ${nameSpace}/${podName}:${sqlContainerPath} ${
                          options.outPath ? options.outPath : _toNewSqlPath
                        }`,
                      );
                      await splitFileFactory(dbName, options.outPath ? options.outPath : _toNewSqlPath);
                    }
                  }
                  break;
                }

                case 'mongoose': {
                  if (options.import === true) {
                    const podNames =
                      options.podName && typeof options.podName === 'string'
                        ? options.podName.split(',')
                        : UnderpostDeploy.API.get('mongo');
                    // `mongodb-0`;
                    for (const podNameData of [podNames[0]]) {
                      const podName = podNameData.NAME;
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf /${dbName}"`);
                      shellExec(
                        `sudo kubectl cp ${
                          options.outPath ? options.outPath : _toBsonPath
                        } ${nameSpace}/${podName}:/${dbName}`,
                      );
                      const cmd = `mongorestore -d ${dbName} /${dbName}${options.drop ? ' --drop' : ''}${
                        options.preserveUUID ? ' --preserveUUID' : ''
                      }`;
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "${cmd}"`);
                    }
                  }
                  if (options.export === true) {
                    const podNames =
                      options.podName && typeof options.podName === 'string'
                        ? options.podName.split(',')
                        : UnderpostDeploy.API.get('mongo'); // `backup-access`;
                    for (const podNameData of [podNames[0]]) {
                      const podName = podNameData.NAME;
                      shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf /${dbName}"`);
                      if (options.collections)
                        for (const collection of options.collections.split(','))
                          shellExec(
                            `sudo kubectl exec -i ${podName} -- sh -c "mongodump -d ${dbName} --collection ${collection} -o /"`,
                          );
                      else shellExec(`sudo kubectl exec -i ${podName} -- sh -c "mongodump -d ${dbName} -o /"`);
                      shellExec(
                        `sudo kubectl cp ${nameSpace}/${podName}:/${dbName} ${
                          options.outPath ? options.outPath : _toNewBsonPath
                        }`,
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
        if (options.export === true && options.git === true) {
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

    /**
     * @method clusterMetadataFactory
     * @description Creates a cluster metadata object for the specified deployment.
     * This method loads database configuration and initializes a cluster metadata object
     * using the provided deployment ID, host, and path.
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID to use.
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host to use.
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path to use.
     * @memberof UnderpostDB
     */
    async clusterMetadataFactory(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
    ) {
      deployId = deployId ?? process.env.DEFAULT_DEPLOY_ID;
      host = host ?? process.env.DEFAULT_DEPLOY_HOST;
      path = path ?? process.env.DEFAULT_DEPLOY_PATH;
      const env = 'production';
      const deployList = fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').split(',');

      const { db } = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'))[host][
        path
      ];
      try {
        await DataBaseProvider.load({ apis: ['instance', 'cron'], host, path, db });

        /** @type {import('../api/instance/instance.model.js').InstanceModel} */
        const Instance = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Instance;

        await Instance.deleteMany();

        for (const _deployId of deployList) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          const confServer = loadReplicas(
            JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
          );
          const router = await UnderpostDeploy.API.routerFactory(deployId, env);
          const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);

          for (const host of Object.keys(confServer)) {
            for (const { path, port } of pathPortAssignmentData[host]) {
              if (!confServer[host][path]) continue;

              const { client, runtime, apis, peer } = confServer[host][path];
              {
                const body = {
                  deployId,
                  host,
                  path,
                  port,
                  client,
                  runtime,
                  apis,
                };

                logger.info('Instance save', body);
                await new Instance(body).save();
              }

              if (peer) {
                const body = {
                  deployId,
                  host,
                  path: path === '/' ? '/peer' : `${path}/peer`,
                  port: port + 1,
                  runtime: 'nodejs',
                };

                logger.info('Instance save', body);
                await new Instance(body).save();
              }
            }
          }
        }
      } catch (error) {
        logger.error(error, error.stack);
      }

      try {
        const cronDeployId = fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
        const confCronPath = `./engine-private/conf/${cronDeployId}/conf.cron.json`;
        const confCron = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

        await DataBaseProvider.load({ apis: ['cron'], host, path, db });

        /** @type {import('../api/cron/cron.model.js').CronModel} */
        const Cron = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Cron;

        await Cron.deleteMany();

        for (const jobId of Object.keys(confCron.jobs)) {
          const body = {
            jobId,
            deployId: UnderpostCron.API.getRelatedDeployId(jobId),
            expression: confCron.jobs[jobId].expression,
            enabled: confCron.jobs[jobId].enabled,
          };
          logger.info('Cron save', body);
          await new Cron(body).save();
        }
      } catch (error) {
        logger.error(error, error.stack);
      }
      await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
    },

    /**
     * @method clusterMetadataBackupCallback
     * @description Handles the backup of cluster metadata for the specified deployment.
     * This method orchestrates the backup process for cluster metadata, including
     * instances and crons, and handles optional Git integration for version control.
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID to use.
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host to use.
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path to use.
     * @param {object} [options] - An object containing boolean flags for various operations.
     * @param {boolean} [options.generate=false] - Flag to generate cluster metadata.
     * @param {boolean} [options.itc=false] - Flag to enable Git integration for version control.
     * @param {boolean} [options.import=false] - Flag to import data from a backup.
     * @param {boolean} [options.export=false] - Flag to export data to a backup.
     * @param {boolean} [options.instances=false] - Flag to backup instances.
     * @param {boolean} [options.crons=false] - Flag to backup crons.
     * @memberof UnderpostDB
     */
    clusterMetadataBackupCallback(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
      options = {
        generate: false,
        itc: false,
        import: false,
        export: false,
        instances: false,
        crons: false,
      },
    ) {
      deployId = deployId ?? process.env.DEFAULT_DEPLOY_ID;
      host = host ?? process.env.DEFAULT_DEPLOY_HOST;
      path = path ?? process.env.DEFAULT_DEPLOY_PATH;

      if (options.generate === true) {
        UnderpostDB.API.clusterMetadataFactory(deployId, host, path);
      }

      if (options.instances === true) {
        const outputPath = './engine-private/instances';
        if (fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        const collection = 'instances';
        if (options.export === true)
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        if (options.import === true)
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
      }
      if (options.crons === true) {
        const outputPath = './engine-private/crons';
        if (fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        const collection = 'crons';
        if (options.export === true)
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        if (options.import === true)
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
      }
    },
  };
}

export default UnderpostDB;
