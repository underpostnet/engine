import mongoose from 'mongoose';
import { loggerFactory } from '../../server/logger.js';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';

/**
 * Module for connecting to and loading models for a MongoDB database using Mongoose.
 * @module src/db/MongooseDB.js
 * @namespace MongooseDBNamespace
 */

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias MongooseDBService
 * @memberof MongooseDBNamespace
 * @classdesc Manages the Mongoose connection lifecycle and dynamic loading of database models
 * based on API configuration.
 */
class MongooseDBService {
  /**
   * Establishes a Mongoose connection to the specified MongoDB instance.
   *
   * @async
   * @param {string} host - The MongoDB host (e.g., 'mongodb://localhost:27017').
   * @param {string} name - The database name.
   * @returns {Promise<mongoose.Connection>} A promise that resolves to the established Mongoose connection object.
   */
  async connect(host, name) {
    const uri = `${host}/${name}`;
    logger.info('MongooseDB connect', { host, name, uri });
    return await mongoose
      .createConnection(uri, {
        serverSelectionTimeoutMS: 5000,
        // readPreference: 'primary',
        // directConnection: true,
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
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
 * @memberof MongooseDBNamespace
 * @type {MongooseDBService}
 */
const MongooseDB = new MongooseDBService();

export { MongooseDB, MongooseDBService as MongooseDBClass };
