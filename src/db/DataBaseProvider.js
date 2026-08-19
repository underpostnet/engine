import { MongooseDB } from './mongo/MongooseDB.js';
import { loggerFactory } from '../server/logger.js';
import { getCapVariableName } from '../client/components/core/CommonJs.js';
import { resolveHostKeyContext } from '../server/conf.js';
import Underpost from '../index.js';

/**
 * Module for managing and loading various database connections (e.g., Mongoose, MariaDB).
 * @module src/db/DataBaseProvider.js
 * @namespace DataBaseProviderService
 */

const logger = loggerFactory(import.meta);

// Health watch defaults. `DB_HEALTH_INTERVAL_MS=0` disables the watch entirely.
const HEALTH_INTERVAL_MS = Number(process.env.DB_HEALTH_INTERVAL_MS ?? 15000);
const HEALTH_PING_TIMEOUT_MS = 5000;

/**
 * Bounds a liveness probe that would otherwise wait on the driver's own connection timeout.
 * @param {Promise<boolean>} probe - Provider probe resolving to liveness.
 * @returns {Promise<boolean>} `false` when the probe throws or outlives the bound.
 */
const withPingTimeout = async (probe) => {
  let timer;
  try {
    return await Promise.race([
      probe,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), HEALTH_PING_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Per-provider health strategies, keyed by `db.provider`.
 *
 * A provider with no entry here gets no health watch and no reconnect: liveness probes,
 * rebuild semantics, and teardown differ per client, so there is nothing generic to fall
 * back on. Adding one (MariaDB, PostgreSQL, …) means adding its case here — the rest of the
 * service dispatches through this table and needs no change.
 *
 * @type {object.<string, {isAlive: Function, rebuild: Function, close: Function}>}
 */
const PROVIDER_HEALTH = {
  mongoose: {
    isAlive: async (connection) => {
      if (!connection || connection.readyState !== 1) return false;
      return await withPingTimeout(
        connection.db
          .admin()
          .command({ ping: 1 })
          .then(() => true),
      );
    },
    rebuild: async ({ apis, db }) => {
      const connection = await MongooseDB.connect(db);
      return { connection, models: await MongooseDB.loadModels({ conn: connection, apis }) };
    },
    close: async (connection) => await connection?.close(),
  },
};

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
   * Timers for the per-provider health watch, keyed by `<contextKey>:<provider>`.
   * @type {object.<string, {timer: object, attempts: number, rebuilding: boolean}>}
   */
  static #watchers = {};

  /**
   * Rebuilds a loaded provider in place: new connection, freshly bound models, old
   * connection closed once the replacement is live.
   *
   * A reconnect is not the same as letting the driver heal itself. For mongoose: after a
   * replica set is reconfigured the driver can hold a topology it will never accept a primary
   * for again — it records the highest `setVersion`/`electionId` it has seen and rejects
   * anything lower for the rest of the process — so only a new client recovers. Every consumer
   * resolves models through this bucket on each call, so swapping the fields in place is
   * enough; nothing has to be re-registered.
   *
   * Only providers present in {@link PROVIDER_HEALTH} can be rebuilt.
   *
   * @param {{host?: string, path?: string}|string} context - Context object or key.
   * @param {string} [provider='mongoose'] - Provider name.
   * @returns {Promise<boolean>} `true` when the provider was rebuilt.
   */
  static async reconnect(context, provider = 'mongoose') {
    const key = resolveHostKeyContext(context);
    const strategy = PROVIDER_HEALTH[provider];
    if (!strategy) {
      logger.warn('No reconnect strategy for provider', { key, provider });
      return false;
    }

    const bucket = this.#instance[key]?.[provider];
    if (!bucket?.rebuild) {
      logger.warn('Cannot reconnect a provider that was never loaded', { key, provider });
      return false;
    }

    const previousConnection = bucket.connection;

    try {
      const { connection, models } = await strategy.rebuild(bucket.rebuild);

      bucket.connection = connection;
      bucket.models = models;
      logger.info('Database connection rebuilt', { key, provider });
    } catch (error) {
      logger.error('Database reconnect failed, keeping the existing connection', {
        key,
        provider,
        error: error.message,
      });
      return false;
    }

    // Closed last and best-effort: the replacement is already serving, and a close that
    // hangs on a dead server must not take the recovery with it.
    try {
      await strategy.close(previousConnection);
    } catch (error) {
      logger.warn('Could not close the replaced connection', { key, provider, error: error.message });
    }
    return true;
  }

  /**
   * Starts the health watch for a provider: pings on an interval and rebuilds the connection
   * on every tick that finds it down, until it answers again. A provider with no
   * {@link PROVIDER_HEALTH} entry is left unwatched.
   * @param {string} key - Resolved context key.
   * @param {string} provider - Provider name.
   */
  static #startHealthWatch(key, provider) {
    const strategy = PROVIDER_HEALTH[provider];
    if (!strategy || !(HEALTH_INTERVAL_MS > 0)) return;
    const watchKey = `${key}:${provider}`;
    if (this.#watchers[watchKey]) return;

    const state = { attempts: 0, rebuilding: false, timer: null };
    state.timer = setInterval(async () => {
      // A rebuild can outlast the interval (the driver's own connect timeout is longer), so
      // ticks that land mid-attempt are skipped rather than stacking attempts.
      if (state.rebuilding) return;
      const bucket = this.#instance[key]?.[provider];
      if (!bucket) return;

      if (await strategy.isAlive(bucket.connection)) {
        if (state.attempts > 0)
          logger.info('Database connection restored', { key, provider, attempts: state.attempts });
        state.attempts = 0;
        return;
      }

      // Every tick retries until the connection answers again: there is no attempt budget to
      // exhaust, because giving up leaves the runtime permanently unable to reach its database.
      state.rebuilding = true;
      state.attempts++;
      logger.warn('Database connection is down, rebuilding', { key, provider, attempt: state.attempts });
      try {
        await this.reconnect(key, provider);
      } finally {
        state.rebuilding = false;
      }
    }, HEALTH_INTERVAL_MS);

    // Never hold the event loop open on account of a health check.
    state.timer.unref?.();
    this.#watchers[watchKey] = state;
  }

  /**
   * Stops the health watch for a provider.
   * @param {string} key - Resolved context key.
   * @param {string} provider - Provider name.
   */
  static #stopHealthWatch(key, provider) {
    const watchKey = `${key}:${provider}`;
    const state = this.#watchers[watchKey];
    if (!state) return;
    clearInterval(state.timer);
    delete this.#watchers[watchKey];
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
              // Kept so the connection can be rebuilt later without the caller being present.
              rebuild: { apis, host, path, db },
              models: await MongooseDB.loadModels({ conn, apis }),
              connection: conn,
              close: async () => {
                this.#stopHealthWatch(key, db.provider);
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
      // Self-guarding: only providers with a PROVIDER_HEALTH entry are actually watched, so a
      // provider added above does not have to remember to opt in here.
      this.#startHealthWatch(key, db.provider);
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
      if (Underpost.env.isInsideContainer()) Underpost.env.set('container-status', 'error');
      return undefined;
    }
  }
}

export {
  DataBaseProviderService as DataBaseProviderClass,
  DataBaseProviderService as default,
  DataBaseProviderService,
};
