import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostDB {
  static API = {
    async import(options = { import: 'default' }) {
      const dbs = {};
      for (const _deployId of options.import.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        for (const host of Object.keys(confServer)) {
          for (const path of Object.keys(confServer[host])) {
            const { db } = confServer[host][path];
            if (db) {
              const { provider, name, user, password } = db;
              if (!dbs[provider]) dbs[provider] = {};

              dbs[provider][name] = { user, password };
            }
          }
        }
      }

      // logger.info('', dbs);
    },
  };
}

export default UnderpostDB;
