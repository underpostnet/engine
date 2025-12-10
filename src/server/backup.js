/**
 * Manages backup operations for deployments.
 * @module src/server/backup.js
 * @namespace BackUp
 */

import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
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
   * @param {boolean} options.git - Whether to backup data using Git.
   * @memberof BackUp
   */
  static callback = async function (deployList, options = { git: false }) {
    if ((!deployList || deployList === 'dd') && fs.existsSync(`./engine-private/deploy/dd.router`))
      deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim();

    logger.info('init backups callback', deployList);
    await logger.setUpInfo();

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      if (!deployId) continue;

      logger.info('Executing database export for', deployId);
      shellExec(`node bin db ${options.git ? '--git ' : ''}--export ${deployId}`);
    }
  };
}

export default BackUp;
