import { MongooseDB } from './mongo/MongooseDB.js';
import { loggerFactory } from '../server/logger.js';

/**
 * Module for managing and loading various database connections (e.g., Mongoose, MariaDB).
 * @module src/db/DataBaseProvider.js
 * @namespace DataBaseProviderNamespace
 */

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias DataBaseProviderService
 * @memberof DataBaseProviderNamespace
 * @classdesc Centralized service for loading, managing, and accessing multiple database connections
 * based on application configuration (host, path, provider type).
 */
class DataBaseProviderService {
  /**
   * Internal storage for database connection instances, keyed by host+path.
   * @type {object.<string, object>}
   * @private
   */
  #instance = {};

  /**
   * Retrieves the internal instance storage for direct access (used for backward compatibility).
   * @returns {object.<string, object>} The internal connection instance map.
   */
  get instance() {
    return this.#instance;
  }

  /**
   * Loads and initializes a database provider based on the configuration.
   * If the connection is already loaded for the given host/path, it returns the existing instance.
   *
   * @async
   * @param {object} [options] - Configuration for the database connection.
   * @param {Array<string>} [options.apis=[]] - List of APIs whose models should be loaded (for Mongoose).
   * @param {string} [options.host=''] - The host part of the application context (e.g., domain).
   * @param {string} [options.path=''] - The path part of the application context.
   * @param {object} [options.db={}] - The specific database configuration object.
   * @param {string} options.db.provider - The name of the database provider ('mongoose', 'mariadb', etc.).
   * @param {string} options.db.host - The database server host.
   * @param {string} options.db.name - The database name.
   * @returns {Promise<object|undefined>} A promise that resolves to the initialized provider object
   * or `undefined` on error or if the provider is already loaded.
   */
  async load(options = { apis: [], host: '', path: '', db: {} }) {
    try {
      const { apis, host, path, db } = options;
      const key = `${host}${path}`;

      if (!this.#instance[key]) this.#instance[key] = {};

      if (!db || this.#instance[key][db.provider]) return this.#instance[key][db.provider];

      // logger.info(`Load ${db.provider} provider`, key);
      switch (db.provider) {
        case 'mongoose':
          {
            const conn = await MongooseDB.connect(db.host, db.name);
            this.#instance[key][db.provider] = {
              models: await MongooseDB.loadModels({ conn, apis }),
              connection: conn,
              close: async () => {
                return await new Promise((resolve) => {
                  this.#instance[key][db.provider].connection.close().then(() => {
                    // logger.info('Mongoose connection is disconnected', db);
                    return resolve();
                  });
                });
              },
            };
          }
          break;
        default:
          break;
      }
      return this.#instance[key][db.provider];
    } catch (error) {
      logger.error(error, { error: error.stack, options });
      return undefined;
    }
  }
}

/**
 * Singleton instance of the DataBaseProviderService class for backward compatibility.
 * @alias DataBaseProvider
 * @memberof DataBaseProviderNamespace
 * @type {DataBaseProviderService}
 */
const DataBaseProvider = new DataBaseProviderService();

export { DataBaseProvider, DataBaseProviderService as DataBaseProviderClass };
