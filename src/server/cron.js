/**
 * UnderpostCron server module
 * @module src/server/cron.js
 * @namespace UnderpostCron
 */

import { Cmd } from './conf.js';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import fs from 'fs-extra';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * UnderpostCron main module methods
 * @class UnderpostCron
 * @memberof UnderpostCron
 */
class UnderpostCron {
  /**
   * Get the JOB static member
   * @static
   * @type {Object}
   * @memberof UnderpostCron
   */
  static get JOB() {
    return {
      /**
       * DNS cli API
       * @static
       * @type {Dns}
       * @memberof UnderpostCron
       */
      dns: Underpost.dns,
      /**
       * BackUp cli API
       * @static
       * @type {BackUp}
       * @memberof UnderpostCron
       */
      backup: Underpost.backup,
    };
  }

  static API = {
    /**
     * Run the cron jobs
     * @static
     * @param {String} deployList - Comma separated deploy ids
     * @param {String} jobList - Comma separated job ids
     * @param {Object} options - Options for cron execution
     * @return {void}
     * @memberof UnderpostCron
     */
    callback: async function (
      deployList = 'default',
      jobList = Object.keys(Underpost.cron.JOB).join(','),
      options = { initPm2Cronjobs: false, git: false, updatePackageScripts: false },
    ) {
      if (options.updatePackageScripts === true) {
        await Underpost.cron.updatePackageScripts(deployList);
        return;
      }

      if (options.initPm2Cronjobs === true) {
        await Underpost.cron.initCronJobs(options);
        return;
      }

      // Execute the requested jobs
      for (const _jobId of jobList.split(',')) {
        const jobId = _jobId.trim();
        if (Underpost.cron.JOB[jobId]) {
          logger.info(`Executing cron job: ${jobId}`);
          await Underpost.cron.JOB[jobId].callback(deployList, options);
        } else {
          logger.warn(`Unknown cron job: ${jobId}`);
        }
      }
    },

    /**
     * Initialize PM2 cron jobs from configuration
     * @static
     * @param {Object} options - Initialization options
     * @memberof UnderpostCron
     */
    initCronJobs: async function (options = { git: false }) {
      logger.info('Initializing PM2 cron jobs');

      // Read cron job deployment ID from dd.cron file (e.g., "dd-cron")
      const jobDeployId = fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
      const confCronPath = `./engine-private/conf/${jobDeployId}/conf.cron.json`;

      if (!fs.existsSync(confCronPath)) {
        logger.warn(`Cron configuration not found: ${confCronPath}`);
        return;
      }

      const confCronConfig = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

      if (!confCronConfig.jobs || Object.keys(confCronConfig.jobs).length === 0) {
        logger.info('No cron jobs configured');
        return;
      }

      // Delete all existing cron jobs
      for (const job of Object.keys(confCronConfig.jobs)) {
        const name = `${jobDeployId}-${job}`;
        logger.info(`Removing existing PM2 process: ${name}`);
        shellExec(Cmd.delete(name));
      }

      // Create PM2 cron jobs for each configured job
      for (const job of Object.keys(confCronConfig.jobs)) {
        const jobConfig = confCronConfig.jobs[job];

        if (jobConfig.enabled === false) {
          logger.info(`Skipping disabled job: ${job}`);
          continue;
        }

        const name = `${jobDeployId}-${job}`;
        const deployIdList = Underpost.cron.getRelatedDeployIdList(job);
        const expression = jobConfig.expression || '0 0 * * *'; // Default: daily at midnight
        const instances = jobConfig.instances || 1; // Default: 1 instance

        logger.info(`Creating PM2 cron job: ${name} with expression: ${expression}, instances: ${instances}`);
        shellExec(Cmd.cron(deployIdList, job, name, expression, options, instances));
      }

      logger.info('PM2 cron jobs initialization completed');
    },

    /**
     * Update package.json start scripts for specified deploy-ids
     * @static
     * @param {String} deployList - Comma separated deploy ids
     * @memberof UnderpostCron
     */
    updatePackageScripts: async function (deployList = 'default') {
      logger.info('Updating package.json start scripts for deploy-id configurations');

      // Resolve deploy list
      if ((!deployList || deployList === 'dd') && fs.existsSync(`./engine-private/deploy/dd.router`)) {
        deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim();
      }

      const confDir = './engine-private/conf';
      if (!fs.existsSync(confDir)) {
        logger.warn(`Configuration directory not found: ${confDir}`);
        return;
      }

      // Parse deploy list into array
      const deployIds = deployList
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id);

      for (const deployId of deployIds) {
        const packageJsonPath = `${confDir}/${deployId}/package.json`;
        const confCronPath = `${confDir}/${deployId}/conf.cron.json`;

        // Only update if both package.json and conf.cron.json exist
        if (!fs.existsSync(packageJsonPath)) {
          logger.info(`Skipping ${deployId}: package.json not found`);
          continue;
        }

        if (!fs.existsSync(confCronPath)) {
          logger.info(`Skipping ${deployId}: conf.cron.json not found`);
          continue;
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const confCron = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

        // Build start script based on cron jobs configuration
        if (confCron.jobs && Object.keys(confCron.jobs).length > 0) {
          const hasEnabledJobs = Object.values(confCron.jobs).some((job) => job.enabled !== false);

          if (hasEnabledJobs) {
            // Update start script with PM2 cron jobs initialization
            const startScript = 'pm2 flush && pm2 reloadLogs && node bin cron --init-pm2-cronjobs --git';

            if (!packageJson.scripts) {
              packageJson.scripts = {};
            }

            packageJson.scripts.start = startScript;

            // Write updated package.json
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n', 'utf8');
            logger.info(`Updated package.json for ${deployId} with cron start script`);
          } else {
            logger.info(`Skipping ${deployId}: no enabled cron jobs`);
          }
        } else {
          logger.info(`Skipping ${deployId}: no cron jobs configured`);
        }
      }

      logger.info('Package.json start scripts update completed');
    },

    /**
     * Get the related deploy id list for the given job id
     * @static
     * @param {String} jobId - The job id (e.g., 'dns', 'backup')
     * @return {String} Comma-separated list of deploy ids to process
     * @memberof UnderpostCron
     */
    getRelatedDeployIdList(jobId) {
      // Backup job uses dd.router file (contains multiple deploy-ids)
      // Other jobs use dd.cron file (contains single deploy-id)
      const deployFilePath =
        jobId === 'backup' ? './engine-private/deploy/dd.router' : './engine-private/deploy/dd.cron';

      if (!fs.existsSync(deployFilePath)) {
        logger.warn(`Deploy file not found: ${deployFilePath}, using default`);
        return fs.existsSync('./engine-private/deploy/dd.cron')
          ? fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim()
          : 'dd-cron';
      }

      // Return the deploy-id list from the file (may be single or comma-separated)
      return fs.readFileSync(deployFilePath, 'utf8').trim();
    },

    /**
     * Get the JOB static object
     * @static
     * @type {Object}
     * @memberof UnderpostCron
     */
    get JOB() {
      return UnderpostCron.JOB;
    },

    /**
     * Get the list of available job IDs
     * @static
     * @return {Array<String>} List of job IDs
     * @memberof UnderpostCron
     */
    getJobsIDs: function () {
      return Object.keys(UnderpostCron.JOB);
    },
  };
}

export default UnderpostCron;
