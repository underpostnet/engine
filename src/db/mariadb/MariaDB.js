import mariadb from 'mariadb';

import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const MariaDB = {
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
      if (error.stack.startsWith('TypeError: Do not know how to serialize a BigInt')) return;
      logger.error(error, error.stack);
    } finally {
      if (conn) conn.release(); //release to pool
      await pool.end();
    }

    return result;
  },
};

export { MariaDB };
