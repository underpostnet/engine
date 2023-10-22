import fs from 'fs';
// import read from 'read';
// import ncp from 'copy-paste';

// import { getRootDirectory, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator, hostPath = ''] = process.argv;
const [host, path = ''] = hostPath.split('/');

try {
  let cmd;
  const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/conf.server.private.json`, 'utf8'));
  const { provider, name, user, password = '', backupPath = '' } = confServer[host][`/${path}`].db;
  switch (provider) {
    case 'mariadb':
      switch (operator) {
        case 'show':
          await (async () => {
            const mariadb = await import('mariadb');
            const pool = mariadb.createPool({
              host: '127.0.0.1',
              port: 3306,
              user,
              password,
            });
            let conn, query;
            try {
              query = 'SHOW DATABASES';
              conn = await pool.getConnection();
              const result = await conn.query(query);
              logger.info(query, result);
            } finally {
              if (conn) conn.release(); //release to pool
            }
            pool.end();
          })();
          break;
        case 'save':
          break;

        default:
          break;
      }

      break;

    default:
      break;
  }

  // logger.info(`Run the following command`, cmd);
  // await ncp.copy(cmd);
  // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
  // throw new Error(``);
} catch (error) {
  logger.error(error);
}
