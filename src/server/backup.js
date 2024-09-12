import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import * as dir from 'path';

const logger = loggerFactory(import.meta);

const BackUpManagement = {
  Init: async function () {
    await this.Callback();
    // setInterval(async () => {
    //   await this.Callback();
    // }, 1000 * 60 * 60); // hourly interval
  },
  Callback: async function () {
    const privateCronConfPath = `./engine-private/conf/${process.argv[2]}/conf.cron.json`;

    const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

    const { backups } = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

    if (!backups) return;

    if (!fs.existsSync('./engine-private/cron-backups'))
      fs.mkdirSync('./engine-private/cron-backups', { recursive: true });

    for (const instanceGroup of backups.instances) {
      const { deployGroup, backupFrequency, lastUpdate, maxBackupRetention } = instanceGroup;
      const deployIds = JSON.parse(fs.readFileSync(`./engine-private/deploy/${deployGroup}.json`, 'utf8'));

      for (const deployId of deployIds) {
        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));

        for (const host of Object.keys(confServer))
          for (const path of Object.keys(confServer[host])) {
            // retention policy
            const backUpPath = `./engine-private/cron-backups/${host}${path.replace(/\\/g, '/').replace(`/`, '-')}`;

            if (fs.existsSync(backUpPath)) {
              // .isDirectory()
              const files = await fs.readdir(backUpPath, { withFileTypes: true });
              for (const relativePathObj of files) {
                console.log('relativePathObj', relativePathObj.name, relativePathObj.isDirectory());
                // const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
                // const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);
              }
            }
          }
      }
    }
  },
};

export { BackUpManagement };
