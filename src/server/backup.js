/**
 * Manages backup operations for deployments.
 * @module src/server/backup.js
 * @namespace UnderpostBakcUp
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
 * @memberof UnderpostBakcUp
 */
class BackUp {
  /**
   * @method callback
   * @description Initiates a backup operation for the specified deployment list.
   * @param {string} deployList - The list of deployments to backup.
   * @param {Object} options - The options for the backup operation.
   * @param {boolean} options.git - Whether to backup data using Git.
   * @param {boolean} [options.k3s] - Use k3s cluster context.
   * @param {boolean} [options.kind] - Use kind cluster context.
   * @param {boolean} [options.kubeadm] - Use kubeadm cluster context.
   * @memberof UnderpostBakcUp
   */
  static callback = async function (deployList, options = { git: false }) {
    if ((!deployList || deployList === 'dd') && fs.existsSync(`./engine-private/deploy/dd.router`))
      deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim();

    logger.info('init backups callback', deployList);
    await logger.setUpInfo();

    const clusterFlag = options.k3s ? ' --k3s' : options.kind ? ' --kind' : options.kubeadm ? ' --kubeadm' : '';

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      if (!deployId) continue;

      logger.info('Executing database export for', deployId);
      shellExec(
        `node bin db ${options.git ? '--git --force-clone ' : ''}--export --primary-pod${clusterFlag} ${deployId}`,
      );
    }
  };
}
/**
 * Main UnderpostBakcup class for backup operations.
 * @class UnderpostBakcup
 * @memberof UnderpostBakcup
 */
class UnderpostBakcUp {
  static API = BackUp;
}

export default UnderpostBakcUp;

export { BackUp, UnderpostBakcUp };
