import mariadb from 'mariadb';
import fs from 'fs';

import { loggerFactory } from '../../server/logger.js';
import { Xampp } from '../../runtime/xampp/Xampp.js';
import { network } from '../../server/network.js';
import { shellExec } from '../../server/process.js';

const logger = loggerFactory(import.meta);

const MariaDB = {
  initService: async function () {
    let cmd;
    // windows
    fs.writeFileSync(
      `C:/xampp/apache/conf/httpd.conf`,
      fs.readFileSync(`C:/xampp/apache/conf/httpd.template.conf`, 'utf8').replace(`Listen 80`, ``),
      'utf8',
    );
    fs.writeFileSync(`C:/xampp/apache/conf/extra/httpd-ssl.conf`, Xampp.router, 'utf8');
    // cmd = `C:/xampp/xampp_stop.exe`;
    // shellExec(cmd);
    await network.port.portClean(3306);
    for (const port of Xampp.ports) await network.port.portClean(port);
    cmd = `C:/xampp/xampp_start.exe`;
    shellExec(cmd);
  },
  query: async (options) => {
    const { host, port, user, password, query } = options;
    const pool = mariadb.createPool({
      host: 'host' in options ? host : '127.0.0.1',
      port: 'port' in options ? port : 3306,
      user: 'user' in options ? user : 'root',
      password: 'password' in options ? password : '',
    });
    let conn, result;
    try {
      conn = await pool.getConnection();
      result = await conn.query(query, { supportBigNumbers: true, bigNumberStrings: true });
      logger.info(query, result);
    } catch (error) {
      logger.error(error, error.stack);
    } finally {
      if (conn) conn.release(); //release to pool
      await pool.end();
    }

    return result;
  },
};

export { MariaDB };
