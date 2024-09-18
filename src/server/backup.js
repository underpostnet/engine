import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import { getDataDeploy } from './conf.js';
import cron from 'node-cron';

const logger = loggerFactory(import.meta);

const BackUpManagement = {
  Init: async function () {
    await this.Callback();

    // Schedule the sending process to run every day at 1 am
    cron.schedule(
      '0 1 * * *',
      async () => {
        await this.Callback();
      },
      {
        scheduled: true,
        timezone: process.env.TIME_ZONE || 'America/New_York',
      },
    );
  },
  Callback: async function () {
    const privateCronConfPath = `./engine-private/conf/${process.argv[2]}/conf.cron.json`;

    const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

    const { backups } = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

    if (!backups) return;

    const currentDate = new Date().getTime();

    if (!fs.existsSync('./engine-private/cron-backups'))
      fs.mkdirSync('./engine-private/cron-backups', { recursive: true });

    for (const deployGroupData of backups) {
      const { deployGroupId } = deployGroupData;
      const dataDeploy = getDataDeploy({ deployGroupId });

      for (const deployObj of dataDeploy) {
        const { deployId } = deployObj;

        const confServer = JSON.parse(
          fs.existsSync(`./engine-private/replica/${deployId}/conf.server.json`)
            ? fs.readFileSync(`./engine-private/replica/${deployId}/conf.server.json`, 'utf8')
            : fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'),
        );

        for (const host of Object.keys(confServer))
          for (const path of Object.keys(confServer[host])) {
            // retention policy
            let { db, backupFrequency, maxBackupRetention, singleReplica } = confServer[host][path];

            if (!db || singleReplica) continue;

            if (!backupFrequency) backupFrequency = 'daily';
            if (!maxBackupRetention) maxBackupRetention = 5;

            const backUpPath = `./engine-private/cron-backups/${host}${path.replace(/\\/g, '/').replace(`/`, '-')}`;
            if (!fs.existsSync(backUpPath)) fs.mkdirSync(`${backUpPath}`, { recursive: true });
            // .isDirectory()
            const files = await fs.readdir(backUpPath, { withFileTypes: true });

            const currentBackupsDirs = files
              .map((fileObj) => parseInt(fileObj.name))
              .sort((a, b) => a - b)
              .reverse();

            switch (backupFrequency) {
              case 'daily':

              default:
                if (currentBackupsDirs[0] && currentDate - currentBackupsDirs[0] <= 1000 * 60 * 60 * 24) continue;
                break;
            }

            for (const retentionPath of currentBackupsDirs.filter((t, i) => i >= maxBackupRetention + 1)) {
              const removePathRetention = `${backUpPath}/${retentionPath}`;
              fs.removeSync(removePathRetention);
            }

            fs.mkdirSync(`${backUpPath}/${currentDate}`, { recursive: true });

            shellExec(`node bin/db ${host}${path} export ${deployId} ${backUpPath}/${currentDate}`);
          }
      }
    }
  },
};

export { BackUpManagement };
