/**
 * Manages backup operations for deployments.
 * @module src/server/backup.js
 * @namespace UnderpostBakcUp
 */

import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import Underpost from '../index.js';
import { loadCronDeployEnv } from './conf.js';

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
   * Orchestrates two backup phases per deployment:
   *   1. Database export (MariaDB / MongoDB dump via `node bin db --export`).
   *   2. Repository backup (git commit+push inside the deployment pod via `node bin db --repo-backup`).
   *
   * Commands are always forwarded to the host node via SSH because the CronJob
   * container itself has no kubectl access. GITHUB_TOKEN and GITHUB_USERNAME
   * are passed as ephemeral inline env vars so they never touch the host filesystem.
   *
   * @param {string} deployList - Comma-separated list of deployment IDs.
   * @param {Object} options - The options for the backup operation.
   * @param {boolean} options.git - Whether to backup data using Git.
   * @param {boolean} [options.k3s] - Use k3s cluster context.
   * @param {boolean} [options.kind] - Use kind cluster context.
   * @param {boolean} [options.kubeadm] - Use kubeadm cluster context.
   * @memberof UnderpostBakcUp
   */
  static callback = async function (deployList, options = { git: false }) {
    const firstDeployId = deployList && deployList !== 'dd' ? deployList.split(',')[0].trim() : '';
    loadCronDeployEnv();
    if ((!deployList || deployList === 'dd') && fs.existsSync(`./engine-private/deploy/dd.router`))
      deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim();

    logger.info('init backups callback', deployList);
    await logger.setUpInfo();

    const clusterFlag = options.k3s ? ' --k3s' : options.kind ? ' --kind' : options.kubeadm ? ' --kubeadm' : '';

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      if (!deployId) continue;

      const dbCommand = `node bin db ${options.git ? '--git --force-clone ' : ''}--export --primary-pod${clusterFlag} ${deployId}`;
      const repoCommand = `node bin db --repo-backup${clusterFlag} ${deployId}`;

      // Pass GITHUB_TOKEN and GITHUB_USERNAME ephemerally through the SSH command
      // so git operations can push backups without relying on host env files.
      const envPrefix = [
        process.env.GITHUB_TOKEN ? `GITHUB_TOKEN=${process.env.GITHUB_TOKEN}` : '',
        process.env.GITHUB_USERNAME ? `GITHUB_USERNAME=${process.env.GITHUB_USERNAME}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const prefixCmd = (cmd) => (envPrefix ? `${envPrefix} ${cmd}` : cmd);

      try {
        logger.info('Executing database export via SSH for', deployId);
        await Underpost.ssh.sshRemoteRunner(prefixCmd(dbCommand), {
          remote: true,
          useSudo: true,
          cd: '/home/dd/engine',
        });
      } catch (err) {
        logger.error(`Error during database export for ${deployId}:`, err);
      }

      // Repository backup: Cron container → SSH to host → host finds pod → kubectl exec git backup
      try {
        logger.info('Executing repository backup via SSH for', deployId);
        await Underpost.ssh.sshRemoteRunner(prefixCmd(repoCommand), {
          remote: true,
          useSudo: true,
          cd: '/home/dd/engine',
        });
      } catch (err) {
        logger.error(`Error during repository backup for ${deployId}:`, err);
      }
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
