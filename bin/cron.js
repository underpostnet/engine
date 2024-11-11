import { BackUpManagement } from '../src/server/backup.js';
import { Cmd } from '../src/server/conf.js';
import { Dns } from '../src/server/dns.js';
import { loggerFactory } from '../src/server/logger.js';
import { netWorkCron, saveRuntimeCron } from '../src/server/network.js';
import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

switch (process.argv[2]) {
  case 'backups':
    {
      await BackUpManagement.Init({ deployId: process.argv[3] });
    }
    break;
  case 'dns':
    {
      await Dns.InitIpDaemon({ deployId: process.argv[3] });
    }
    break;

  case 'run': {
    const confCronConfig = JSON.parse(fs.readFileSync(`./engine-private/conf/${process.argv[3]}/conf.cron.json`));
    if (confCronConfig.jobs && Object.keys(confCronConfig.jobs).length > 0) {
      shellExec(`node bin/deploy conf ${process.argv[3]} production`);
      for (const job of Object.keys(confCronConfig.jobs)) {
        if (confCronConfig.jobs[job].enabled) {
          shellExec(Cmd.cron(process.argv[3], job, confCronConfig.jobs[job].expression));
          netWorkCron.push({
            deployId: process.argv[3],
            jobId: job,
            expression: confCronConfig.jobs[job].expression,
          });
        }
      }
    }
    await saveRuntimeCron();
    if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
    break;
  }

  default:
    break;
}
