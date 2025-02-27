import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostDB {
  static API = {
    async import(options = { import: 'default' }) {
      for (const _deployId of options.import.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const dbs = {};
        const repoName = `engine-${deployId.split('dd-')[1]}-cron-backups`;

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        for (const host of Object.keys(confServer)) {
          for (const path of Object.keys(confServer[host])) {
            const { db } = confServer[host][path];
            if (db) {
              const { provider, name, user, password } = db;
              if (!dbs[provider]) dbs[provider] = {};

              if (!(name in dbs[provider]))
                dbs[provider][name] = { user, password, hostFolder: host + path.replaceAll('/', '-') };
            }
          }
        }

        if (!fs.existsSync(`../${repoName}`)) {
          shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
        } else {
          shellExec(`cd ../${repoName} && underpost pull . ${process.env.GITHUB_USERNAME}/${repoName}`);
        }

        for (const provider of Object.keys(dbs)) {
          for (const dbName of Object.keys(dbs[provider])) {
            const { hostFolder } = dbs[provider][dbName];
            if (hostFolder) {
              const backUpPath = `../${repoName}/${hostFolder}`;
              const times = await fs.readdir(backUpPath);
              const currentBackupTimestamp = Math.max(...times.map((t) => parseInt(t)));
              dbs[provider][dbName].currentBackupTimestamp = currentBackupTimestamp;
            }
          }
        }

        logger.info('', { repoName, dbs });
      }
    },
  };
}

export default UnderpostDB;
