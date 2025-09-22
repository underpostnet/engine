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
      options = { itc: false, init: false, git: false },
    ) {
      if (options.init === true) {
        const jobDeployId = fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
        deployList = fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').trim();
        const confCronConfig = JSON.parse(fs.readFileSync(`./engine-private/conf/${jobDeployId}/conf.cron.json`));
        if (confCronConfig.jobs && Object.keys(confCronConfig.jobs).length > 0) {
          for (const job of Object.keys(confCronConfig.jobs)) {
            const name = `${jobDeployId}-${job}`;
            let deployId;
            shellExec(Cmd.delete(name));
            deployId = UnderpostCron.API.getRelatedDeployId(job);
            shellExec(Cmd.cron(deployId, job, name, confCronConfig.jobs[job].expression, options));
          }
        }
        return;
      }
      for (const _jobId of jobList.split(',')) {
        const jobId = _jobId.trim();
        if (UnderpostCron.JOB[jobId]) await UnderpostCron.JOB[jobId].callback(deployList, options);
      }
    },
    getRelatedDeployId(jobId) {
      switch (jobId) {
        case 'dns':
          return fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
        case 'backup':
          return fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').trim();
        default:
          return fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim();
      }
    },
  };
}

export default UnderpostCron;
