import mariadb from 'mariadb';

import { loggerFactory } from '../../server/logger.js';

/**
 * Module for interacting with MariaDB/MySQL databases using the mariadb connector.
 * @module src/db/MariaDB.js
 * @namespace MariaDBNamespace
 */

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias MariaDBService
 * @memberof MariaDBNamespace
 * @classdesc Provides a simplified interface for executing queries against a MariaDB/MySQL database
 * using a connection pool, ensuring connection management (acquisition and release).
 */
class MariaDBService {
  /**
   * Executes a SQL query against the MariaDB database.
   *
   * @async
   * @param {object} options - The database connection and query options.
   * @param {string} [options.host='127.0.0.1'] - The database host.
   * @param {number} [options.port=3306] - The database port.
   * @param {string} [options.user='root'] - The database user.
   * @param {string} [options.password=''] - The database password.
   * @param {string} options.query - The SQL query string to execute.
   * @returns {Promise<any>} The result of the database query.
   */
  async query(options) {
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
      logger.info('query');
      console.log(result);
    } catch (error) {
      logger.error(error, error.stack);
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
 * @memberof MariaDBNamespace
 * @type {MariaDBService}
 */
const MariaDB = new MariaDBService();

export { MariaDB, MariaDBService as MariaDBClass };
