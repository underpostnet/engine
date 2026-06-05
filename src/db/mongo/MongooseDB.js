import mongoose from 'mongoose';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';

/**
 * Module for connecting to and loading models for a MongoDB database using Mongoose.
 * @module src/db/MongooseDB.js
 * @namespace MongooseDBService
 */

const logger = loggerFactory(import.meta);

const MONGODB_SERVICE_NAME = 'mongodb-service';
const MONGODB_STATEFULSET_NAME = 'mongodb';
const MONGODB_DEFAULT_AUTH_SOURCE = 'admin';
const MONGODB_DEFAULT_REPLICA_SET = 'rs0';
const MONGODB_DEFAULT_REPLICA_COUNT = 3;

/**
 * Resolves MongoDB replica hosts from explicit input or StatefulSet defaults.
 * @param {{hostList?: string, replicaCount?: number}} [options] - Host resolution options.
 * @returns {Array<string>} Normalized host:port entries.
 */
const resolveMongoReplicaHosts = ({ hostList = '', replicaCount = MONGODB_DEFAULT_REPLICA_COUNT }) => {
  if (hostList) {
    return hostList
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean)
      .map((host) => (host.includes(':') ? host : `${host}:27017`));
  }

  return Array.from(
    { length: replicaCount },
    (_, index) => `${MONGODB_STATEFULSET_NAME}-${index}.${MONGODB_SERVICE_NAME}:27017`,
  );
};

/**
 * @class
 * @alias MongooseDBService
 * @memberof MongooseDBService
 * @classdesc Manages the Mongoose connection lifecycle and dynamic loading of database models
 * based on API configuration.
 *
 * Connection parameters are resolved in the following order:
 * 1. Explicit values passed as arguments to {@link MongooseDBService#connect}.
 * 2. Environment variables (`DB_HOST` for host, `DB_NAME` for database name).
 * 3. No built-in defaults — both `host` and `name` are required from the caller or environment.
 */
class MongooseDBService {
  /**
   * Normalizes Mongo host inputs into plain host:port entries.
   * @param {Array<string>|string} hosts - Host input as list or comma-separated string.
   * @returns {Array<string>} Normalized host:port entries.
   */
  normalizeHosts(hosts) {
    const hostEntries = Array.isArray(hosts) ? hosts : `${hosts || ''}`.split(',');

    return hostEntries
      .map((entry) => `${entry || ''}`.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^mongodb:\/\//, '').replace(/\/.*$/, ''));
  }

  /**
   * Normalizes connection config from object or legacy host/name signature.
   * @param {object|string} configOrHost - Connection config object or host string.
   * @param {string} [name] - Legacy DB name when using host string input.
   * @returns {{authSource: string, dbName: string, directConnection: boolean, hosts: Array<string>, password: string, replicaSet: string, user: string}} Normalized config.
   */
  normalizeConfig(configOrHost, name) {
    const config =
      typeof configOrHost === 'object' && configOrHost !== null ? { ...configOrHost } : { host: configOrHost, name };

    const rawHosts = config.host || process.env.DB_HOST;
    const hosts = this.normalizeHosts(rawHosts);
    const dbName = config.name || process.env.DB_NAME;

    if (!hosts.length || !dbName) {
      const missing = [!hosts.length && 'host (db.host|DB_HOST)', !dbName && 'name (db.name|DB_NAME)']
        .filter(Boolean)
        .join(', ');
      throw new Error(`MongooseDBService.connect: missing required parameter(s): ${missing}`);
    }

    const user = config.user || process.env.DB_USER || '';
    const password = config.password || process.env.DB_PASSWORD || '';
    const hasExplicitReplicaSet = !!(config.replicaSet || process.env.DB_REPLICA_SET);
    const directConnection = hosts.length === 1 && !hasExplicitReplicaSet;
    const replicaSet = directConnection
      ? ''
      : config.replicaSet || process.env.DB_REPLICA_SET || MONGODB_DEFAULT_REPLICA_SET;
    const authSource = config.authSource || process.env.DB_AUTH_SOURCE || (user ? MONGODB_DEFAULT_AUTH_SOURCE : '');

    return {
      authSource,
      dbName,
      directConnection,
      hosts,
      password,
      replicaSet,
      user,
    };
  }

  /**
   * Builds a MongoDB URI from normalized config options.
   * @param {object|string} configOrHost - Connection config object or host string.
   * @param {string} [name] - Legacy DB name when using host string input.
   * @returns {string} MongoDB connection URI.
   */
  buildUri(configOrHost, name) {
    const config = this.normalizeConfig(configOrHost, name);
    const credentials =
      config.user && config.password
        ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@`
        : '';
    const query = new URLSearchParams();

    if (config.directConnection) query.set('directConnection', 'true');
    else if (config.replicaSet) query.set('replicaSet', config.replicaSet);
    if (config.authSource) query.set('authSource', config.authSource);

    return `mongodb://${credentials}${config.hosts.join(',')}/${config.dbName}${query.size ? `?${query.toString()}` : ''}`;
  }

  /**
   * Establishes a Mongoose connection to the specified MongoDB instance.
   *
   * @async
   * @param {object|string} configOrHost - Either a db config object or a legacy host string.
   * @param {string} [configOrHost.host] - Legacy single host or comma-separated host list.
   * @param {string} [configOrHost.name] - The database name.
   * @param {string} [configOrHost.replicaSet] - The MongoDB replica set name.
   * @param {string} [configOrHost.authSource] - The authentication database.
   * @param {string} [configOrHost.user] - The MongoDB username.
   * @param {string} [configOrHost.password] - The MongoDB password.
   * @param {string} [name] - Legacy database name when a host string is passed.
   * @returns {Promise<mongoose.Connection>} A promise that resolves to the established Mongoose connection object.
   * @throws {Error} If neither the argument nor the corresponding environment variable supplies a value.
   */
  async connect(configOrHost, name) {
    const uri = this.buildUri(configOrHost, name);
    if (process.env.NODE_ENV === 'development') logger.info(`Connecting to MongoDB with URI`, uri);
    return await mongoose
      .createConnection(uri, {
        autoIndex: process.env.NODE_ENV !== 'production',
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 20,
        minPoolSize: 2,
        retryReads: true,
        retryWrites: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .asPromise();
  }

  /**
   * Dynamically loads Mongoose models for a list of APIs and binds them to the given connection.
   *
   * @async
   * @param {object} [options] - Options for model loading.
   * @param {Array<string>} [options.apis=['test']] - List of API names (folders) to load models from.
   * @param {mongoose.Connection} [options.conn=new mongoose.Connection()] - The active Mongoose connection.
   * @returns {Promise<object>} A promise that resolves to an object map of loaded Mongoose models.
   */
  async loadModels(options = { apis: ['test'], conn: new mongoose.Connection() }) {
    const { conn, apis } = options;
    const models = {};
    for (const api of apis) {
      // Dynamic import of the model file
      const { ProviderSchema } = await import(`../../api/${api}/${api}.model.js`);
      const keyModel = getCapVariableName(api); // Assuming this returns a capitalized model name
      models[keyModel] = conn.model(keyModel, ProviderSchema);
    }

    return models;
  }
}

/**
 * Singleton instance of the MongooseDBService class for backward compatibility.
 * @alias MongooseDB
 * @memberof MongooseDBService
 * @type {MongooseDBService}
 */
const MongooseDB = new MongooseDBService();

export {
  MongooseDB,
  MongooseDBService as MongooseDBClass,
  MONGODB_DEFAULT_REPLICA_COUNT,
  MONGODB_DEFAULT_REPLICA_SET,
  MONGODB_SERVICE_NAME,
  MONGODB_STATEFULSET_NAME,
  resolveMongoReplicaHosts,
};
