/**
 * Manages backup operations for deployments.
 * @module src/server/backup.js
 * @namespace BackUp
 */

import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import { getCronBackUpFolder } from './conf.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class BackUp
 * @description Manages backup operations for deployments.
 * @memberof BackUp
 */
class BackUp {
  /**
   * @method callback
   * @description Initiates a backup operation for the specified deployment list.
   * @param {string} deployList - The list of deployments to backup.
   * @param {Object} options - The options for the backup operation.
   * @param {boolean} options.itc - Whether to backup inside container data.
   * @param {boolean} options.git - Whether to backup data using Git.
   * @memberof BackUp
   */
  static callback = async function (deployList, options = { itc: false, git: false }) {
    if ((!deployList || deployList === 'dd') && fs.existsSync(`./engine-private/deploy/dd.router`))
      deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8');

    logger.info('init backups callback', deployList);
    await logger.setUpInfo();
    const currentDate = new Date().getTime();
    const maxBackupRetention = 5;

    if (!fs.existsSync('./engine-private/cron-backups'))
      fs.mkdirSync('./engine-private/cron-backups', { recursive: true });

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      if (!deployId) continue;

      if (!(options.itc === true)) {
        shellExec(`node bin db ${options.git ? '--git ' : ''}--export ${deployId}`);
        continue;
      }

      const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));

      for (const host of Object.keys(confServer))
        for (const path of Object.keys(confServer[host])) {
          // retention policy
          const { db } = confServer[host][path];
          if (!db) continue;
          logger.info('Init backup', { host, path, db });

          const backUpPath = `${process.cwd()}/engine-private/cron-backups/${getCronBackUpFolder(host, path)}`;
          if (!fs.existsSync(backUpPath)) fs.mkdirSync(`${backUpPath}`, { recursive: true });
          // .isDirectory()
          const files = await fs.readdir(backUpPath, { withFileTypes: true });

          const currentBackupsDirs = files
            .map((fileObj) => parseInt(fileObj.name))
            .sort((a, b) => a - b)
            .reverse();

          for (const retentionPath of currentBackupsDirs.filter((t, i) => i >= maxBackupRetention - 1)) {
            const removePathRetention = `${backUpPath}/${retentionPath}`;
            logger.info('Remove backup folder', removePathRetention);
            fs.removeSync(removePathRetention);
          }

          fs.mkdirSync(`${backUpPath}/${currentDate}`, { recursive: true });

          shellExec(`node bin/db ${host}${path} export ${deployId} ${backUpPath}/${currentDate}`);
        }
      shellExec(
        `cd ./engine-private/cron-backups` +
          ` && underpost pull . ${process.env.GITHUB_USERNAME}/cron-backups` +
          ` && git add .` +
          ` && underpost cmt . backup cron-job '${new Date().toLocaleDateString()}'` +
          ` && underpost push . ${process.env.GITHUB_USERNAME}/cron-backups`,
        {
          silent: true,
        },
      );
    }
  };
}

export default BackUp;
