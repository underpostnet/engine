import { MongooseDB } from './mongo/MongooseDB.js';
import { loggerFactory } from '../server/logger.js';
import { getCapVariableName } from '../client/components/core/CommonJs.js';
import { resolveHostKeyContext } from '../server/conf.js';

/**
 * Module for managing and loading various database connections (e.g., Mongoose, MariaDB).
 * @module src/db/DataBaseProvider.js
 * @namespace DataBaseProviderService
 */

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias DataBaseProviderService
 * @memberof DataBaseProviderService
 * @classdesc Service for loading, managing, and accessing multiple database connections
 * based on application configuration (host, path, provider type).
 */
class DataBaseProviderService {
  /**
   * Internal storage for database connection instances, keyed by host+path.
   * @type {object.<string, object>}
   * @method
   */
  static #instance = {};

  /**
   * Retrieves the internal instance storage for direct access (used for backward compatibility).
   * @returns {object.<string, object>} The internal connection instance map.
   */
  static get instance() {
    return this.#instance;
  }


  /**
   * Retrieves a loaded provider bucket for a context.
   * @param {{host?: string, path?: string}|string} [context={ host: '', path: '' }] - Context object or key.
   * @param {string} [provider='mongoose'] - Provider name.
   * @returns {{models: object, connection: object, close: Function, dbSignature?: string}} Provider bucket.
   * @throws {Error} When the provider is not loaded for the context.
   */
  static getProvider(context = { host: '', path: '' }, provider = 'mongoose') {
    const key = resolveHostKeyContext(context);
    const entry = this.#instance[key]?.[provider];

    if (!entry) throw new Error(`Database provider not loaded for context "${key}" (${provider})`);
    return entry;
  }

  /**
   * Returns the raw DB connection object for a context/provider.
   * @param {{host?: string, path?: string}|string} [context={ host: '', path: '' }] - Context object or key.
   * @param {string} [provider='mongoose'] - Provider name.
   * @returns {object} Provider connection object.
   */
  static getConnection(context = { host: '', path: '' }, provider = 'mongoose') {
    return this.getProvider(context, provider).connection;
  }

  /**
   * Resolves a loaded model by name for a given context/provider.
   * @param {string} modelName - API/model identifier.
   * @param {{host?: string, path?: string}|string} [context={ host: '', path: '' }] - Context object or key.
   * @param {string} [provider='mongoose'] - Provider name.
   * @returns {object} Loaded model instance.
   * @throws {Error} When the model is not loaded for the context.
   */
  static getModel(modelName, context = { host: '', path: '' }, provider = 'mongoose') {
    const models = this.getProvider(context, provider).models || {};
    const normalizedModelName = getCapVariableName(modelName);

    // First try direct key (supports callers passing exact model names).
    let model = models?.[modelName];
    if (!model) {
      model = models?.[normalizedModelName];
    }

    if (!model) {
      // Final fallback: case-insensitive comparison without separators.
      const target = String(modelName || '')
        .replaceAll('-', '')
        .replaceAll('_', '')
        .replaceAll(' ', '')
        .toLowerCase();
      const resolvedModelName = Object.keys(models).find(
        (key) => key.replaceAll('_', '').replaceAll(' ', '').toLowerCase() === target,
      );
      if (resolvedModelName) model = models[resolvedModelName];
    }

    if (!model) {
      throw new Error(`Model not loaded for context "${resolveHostKeyContext(context)}": ${normalizedModelName}`);
    }

    return model;
  }

  /**
   * Builds a minimal dispatcher bound to a specific context/provider.
   * @param {{host?: string, path?: string}|string} [context={ host: '', path: '' }] - Context object or key.
   * @param {string} [provider='mongoose'] - Provider name.
   * @returns {{getConnection: () => object, getModel: (modelName: string) => object}} Bound accessor helpers.
   */
  static getDispatcher(context = { host: '', path: '' }, provider = 'mongoose') {
    return {
      getConnection: () => this.getConnection(context, provider),
      getModel: (modelName) => this.getModel(modelName, context, provider),
    };
  }

  /**
   * Builds a stable signature used to detect provider configuration changes.
   * @param {object} [db={}] - Database configuration object.
   * @returns {string} Stringified signature for change detection.
   */
  static buildDbSignature(db = {}) {
    return JSON.stringify({
      authSource: db.authSource || '',
      host: db.host || '',
      name: db.name || '',
      provider: db.provider || '',
      replicaSet: db.replicaSet || '',
    });
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
  static async load(options = { apis: [], host: '', path: '', db: {} }) {
    try {
      const { apis, host, path, db } = options;
      const key = resolveHostKeyContext({ host, path });
      const dbSignature = DataBaseProviderService.buildDbSignature(db);

      if (!this.#instance[key]) this.#instance[key] = {};
      if (!db) return undefined;

      const currentProvider = this.#instance[key][db.provider];
      if (currentProvider && currentProvider.dbSignature === dbSignature) return currentProvider;

      if (currentProvider && currentProvider.close) {
        await currentProvider.close();
        delete this.#instance[key][db.provider];
      }

      // logger.info(`Load ${db.provider} provider`, key);
      switch (db.provider) {
        case 'mongoose':
          {
            const conn = await MongooseDB.connect(db);
            this.#instance[key][db.provider] = {
              dbSignature,
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
      // Sanitize options to prevent credential exposure in logs
      const safeOptions = {
        apis: options.apis,
        host: options.host,
        path: options.path,
        db: options.db
          ? {
            provider: options.db.provider,
            name: options.db.name ? '***' : undefined,
            host: options.db.host ? '***' : undefined,
            user: options.db.user ? '***' : undefined,
            password: options.db.password ? '***' : undefined,
          }
          : {},
      };
      logger.error(error.message, { safeOptions });
      return undefined;
    }
  }
}


export {
  DataBaseProviderService as DataBaseProviderClass,
  DataBaseProviderService as default,
  DataBaseProviderService
};
