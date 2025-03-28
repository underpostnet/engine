/**
 * UnderpostCron CLI index module
 * @module src/cli/cron.js
 * @namespace UnderpostCron
 */

import { DataBaseProvider } from '../db/DataBaseProvider.js';
import BackUp from '../server/backup.js';
import { Cmd } from '../server/conf.js';
import Dns from '../server/dns.js';
import { loggerFactory } from '../server/logger.js';

import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

/**
 * UnderpostCron main module methods
 * @class
 * @memberof UnderpostCron
 */
class UnderpostCron {
  static NETWORK = [];
  static JOB = {
    /**
     * DNS cli API
     * @static
     * @type {Dns}
     * @memberof UnderpostCron
     */
    dns: Dns,
    /**
     * BackUp cli API
     * @static
     * @type {BackUp}
     * @memberof UnderpostCron
     */
    backup: BackUp,
  };
  static API = {
    /**
     * Run the cron jobs
     * @static
     * @param {String} deployList - Comma separated deploy ids
     * @param {String} jobList - Comma separated job ids
     * @return {void}
     * @memberof UnderpostCron
     */
    callback: async function (
      deployList = 'default',
      jobList = Object.keys(UnderpostCron.JOB),
      options = { itc: false, init: false, git: false, dashboardUpdate: false },
    ) {
      if (options.init === true) {
        UnderpostCron.NETWORK = [];
        const jobDeployId = fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
        deployList = fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').trim();
        const confCronConfig = JSON.parse(fs.readFileSync(`./engine-private/conf/${jobDeployId}/conf.cron.json`));
        if (confCronConfig.jobs && Object.keys(confCronConfig.jobs).length > 0) {
          for (const job of Object.keys(confCronConfig.jobs)) {
            const name = `${jobDeployId}-${job}`;
            let deployId;
            if (!options.dashboardUpdate) shellExec(Cmd.delete(name));
            switch (job) {
              case 'dns':
                deployId = jobDeployId;
                break;

              default:
                deployId = deployList;
                break;
            }
            if (!options.dashboardUpdate)
              shellExec(Cmd.cron(deployId, job, name, confCronConfig.jobs[job].expression, options));
            UnderpostCron.NETWORK.push({
              deployId,
              jobId: job,
              expression: confCronConfig.jobs[job].expression,
            });
          }
        }
        if (options.dashboardUpdate === true) await UnderpostCron.API.updateDashboardData();
        if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
        return;
      }
      for (const _jobId of jobList.split(',')) {
        const jobId = _jobId.trim();
        if (UnderpostCron.JOB[jobId]) await UnderpostCron.JOB[jobId].callback(deployList, options);
      }
    },
    async updateDashboardData() {
      try {
        const deployId = process.env.DEFAULT_DEPLOY_ID;
        const host = process.env.DEFAULT_DEPLOY_HOST;
        const path = process.env.DEFAULT_DEPLOY_PATH;
        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
        const { db } = confServer[host][path];

        await DataBaseProvider.load({ apis: ['cron'], host, path, db });

        /** @type {import('../api/cron/cron.model.js').CronModel} */
        const Cron = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Cron;

        await Cron.deleteMany();

        for (const cronInstance of UnderpostCron.NETWORK) {
          logger.info('save', cronInstance);
          await new Cron(cronInstance).save();
        }

        await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
      } catch (error) {
        logger.error(error, error.stack);
      }
    },
  };
}

export default UnderpostCron;
