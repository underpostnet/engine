import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import { shellCd, shellExec } from './process.js';
import { getCronBackUpFolder, getDataDeploy } from './conf.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const BackUpManagement = {
  repoUrl: `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_BACKUP_REPO}.git`,
  Init: async function ({ deployId }) {
    const Callback = async function () {
      const privateCronConfPath = `./engine-private/conf/${deployId}/conf.cron.json`;

      const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

      const { backups } = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

      if (!backups) return;

      logger.info('init backups callback');
      await logger.setUpInfo();

      const currentDate = new Date().getTime();

      if (!fs.existsSync('./engine-private/cron-backups'))
        fs.mkdirSync('./engine-private/cron-backups', { recursive: true });

      for (const deployGroupData of backups) {
        const { deployGroupId } = deployGroupData;
        const dataDeploy = getDataDeploy({ deployGroupId });

        for (const deployObj of dataDeploy) {
          const { deployId, replicaHost } = deployObj;

          if (replicaHost) continue;

          const confServer = JSON.parse(
            fs.existsSync(`./engine-private/replica/${deployId}/conf.server.json`)
              ? fs.readFileSync(`./engine-private/replica/${deployId}/conf.server.json`, 'utf8')
              : fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'),
          );

          for (const host of Object.keys(confServer))
            for (const path of Object.keys(confServer[host])) {
              // retention policy
              let { db, backupFrequency, maxBackupRetention, singleReplica, wp, git, directory } =
                confServer[host][path];

              if (!db || singleReplica) continue;

              if (!backupFrequency) backupFrequency = 'daily';
              if (!maxBackupRetention) maxBackupRetention = 5;

              const backUpPath = `${process.cwd()}/engine-private/cron-backups/${getCronBackUpFolder(host, path)}`;
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
                  // if (currentBackupsDirs[0] && currentDate - currentBackupsDirs[0] < 1000 * 60 * 60 * 24) continue;
                  break;
              }

              for (const retentionPath of currentBackupsDirs.filter((t, i) => i >= maxBackupRetention - 1)) {
                const removePathRetention = `${backUpPath}/${retentionPath}`;
                logger.info('Remove backup folder', removePathRetention);
                fs.removeSync(removePathRetention);
              }

              fs.mkdirSync(`${backUpPath}/${currentDate}`, { recursive: true });

              shellExec(`node bin/db ${host}${path} export ${deployId} ${backUpPath}/${currentDate}`);

              if (wp) {
                const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${git
                  .split('/')
                  .pop()}.git`;

                shellExec(
                  `cd ${directory}` +
                    ` && git pull ${repoUrl}` +
                    ` && git add . && git commit -m "backup ${new Date().toLocaleDateString()}"` +
                    ` && git push ${repoUrl}`,
                );
              }
            }
        }
      }
      shellExec(
        `cd ./engine-private/cron-backups` +
          ` && git pull ${BackUpManagement.repoUrl}` +
          ` && git add . && git commit -m "backup ${new Date().toLocaleDateString()}"` +
          ` && git push ${BackUpManagement.repoUrl}`,
      );
    };
    await Callback();
    BackUpManagement.Callback = Callback;
    return Callback;
  },
  Callback: async function (params) {},
};

export { BackUpManagement };
