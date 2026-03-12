import { createPool } from 'mariadb';

import { loggerFactory } from '../../server/logger.js';

/**
 * Module for interacting with MariaDB/MySQL databases using the mariadb connector.
 * @module src/db/MariaDB.js
 * @namespace MariaDBService
 */

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias MariaDBService
 * @memberof MariaDBService
 * @classdesc Provides a simplified interface for executing queries against a MariaDB/MySQL database
 * using a connection pool, ensuring connection management (acquisition and release).
 *
 * Connection credentials are resolved in the following order:
 * 1. Explicit values passed in the `options` parameter.
 * 2. Environment variables (`MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`).
 * 3. Safe built-in defaults (`127.0.0.1`, `3306`, `root`, empty password).
 */
class MariaDBService {
  /**
   * Executes a SQL query against the MariaDB database.
   *
   * @async
   * @param {object} options - The database connection and query options.
   * @param {string} [options.host] - The database host. Falls back to `process.env.MARIADB_HOST` then `'127.0.0.1'`.
   * @param {number} [options.port] - The database port. Falls back to `process.env.MARIADB_PORT` then `3306`.
   * @param {string} [options.user] - The database user. Falls back to `process.env.MARIADB_USER` then `'root'`.
   * @param {string} [options.password] - The database password. Falls back to `process.env.MARIADB_PASSWORD` then `''`.
   * @param {string} options.query - The SQL query string to execute.
   * @returns {Promise<any>} The result of the database query.
   */
  async query(options) {
    const { host, port, user, password, query } = options;
    const pool = createPool({
      host: 'host' in options ? host : process.env.MARIADB_HOST || '127.0.0.1',
      port: 'port' in options ? port : parseInt(process.env.MARIADB_PORT, 10) || 3306,
      user: 'user' in options ? user : process.env.MARIADB_USER || 'root',
      password: 'password' in options ? password : process.env.MARIADB_PASSWORD || '',
    });
    let conn, result;
    try {
      conn = await pool.getConnection();
      result = await conn.query(query, { supportBigNumbers: true, bigNumberStrings: true });
      logger.info('query');
      console.log(result);
    } catch (error) {
      logger.error('MariaDB query failed', { error: error.message });
    } finally {
      if (conn) conn.release(); // release to pool
      await pool.end();
    }

    return result;
  }
}

/**
 * Singleton instance of the MariaDBService class for backward compatibility.
 * @alias MariaDB
 * @memberof MariaDBService
 * @type {MariaDBService}
 */
const MariaDB = new MariaDBService();

export { MariaDB, MariaDBService as MariaDBClass };
