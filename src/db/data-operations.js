/**
 * The collection operations a database provider offers to `underpost db collection`.
 *
 * A provider declares the operations it supports in `capabilities`. MongoDB is the only provider.
 * Document references, index copies and collection renames have no equivalent in other databases,
 * so the contract asks no provider to support an operation it cannot do faithfully.
 *
 * @module src/db/data-operations.js
 * @namespace DataOperations
 */

import { MongoCollectionOperations } from './mongo/mongo-collection-operations.js';

/**
 * @typedef {'inspect'|'clone'|'move'|'rename'} CollectionOperation
 * @memberof DataOperations
 */

/**
 * A resolved operation target. It holds the database configuration with its credentials: a
 * provider connects with it and never prints it.
 * @typedef {Object} DataOperationTarget
 * @property {string} deployId
 * @property {string} host
 * @property {string} path
 * @property {Object} db - The `db` block of the host path, secrets resolved.
 * @property {string} [database] - Explicit database override.
 * @property {string} [backupId] - A backup this target reads instead of the live database.
 * @memberof DataOperations
 */

/**
 * @typedef {Object} DataOperationsProvider
 * @property {string} provider - The `db.provider` value it serves.
 * @property {Readonly<Record<CollectionOperation, boolean>>} capabilities
 * @property {(target: DataOperationTarget) => Promise<Object>} openEndpoint - Connects to a target.
 * @property {(params: Object) => Promise<Object>} inspectCollection
 * @property {(params: Object) => Promise<Object>} cloneCollection
 * @property {(params: Object) => Promise<Object>} moveCollection
 * @property {(params: Object) => Promise<Object>} renameCollection
 * @memberof DataOperations
 */

/**
 * The providers by `db.provider`. Read at call time: the CLI barrel imports this module while the
 * provider module is still loading.
 * @returns {Record<string, DataOperationsProvider>}
 */
const providers = () => ({ [MongoCollectionOperations.provider]: MongoCollectionOperations });

/**
 * The provider of a database, checked for one operation.
 * @param {string} provider - `db.provider` of the target.
 * @param {CollectionOperation} operation
 * @returns {DataOperationsProvider}
 * @throws {Error} When no provider serves the database, or it does not support the operation.
 * @memberof DataOperations
 */
export const dataOperationsProvider = (provider, operation) => {
  const implementation = providers()[provider];
  if (!implementation) throw new Error(`Database provider "${provider}" has no collection operations`);
  if (!implementation.capabilities[operation])
    throw new Error(`Database provider "${provider}" does not support the ${operation} operation`);
  return implementation;
};
