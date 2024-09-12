import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import { getDataDeploy } from './conf.js';

const logger = loggerFactory(import.meta);

const BackUpManagement = {
  Init: async function () {
    await this.Callback();
    setInterval(async () => {
      await this.Callback();
    }, 1000 * 60 * 60); // hourly interval
  },
  Callback: async function () {
    const privateCronConfPath = `./engine-private/conf/${process.argv[2]}/conf.cron.json`;

    const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

    const { backups } = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

    if (!backups) return;

    const currentDate = new Date().getTime();

    if (!fs.existsSync('./engine-private/cron-backups'))
      fs.mkdirSync('./engine-private/cron-backups', { recursive: true });

    for (const deployGroupId of backups) {
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
            let { db, backupFrequency, maxBackupRetention } = confServer[host][path];

            if (!db) continue;

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
