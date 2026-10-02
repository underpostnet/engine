/**
 * The databases each context serves: the identity of the content data a running host reads.
 *
 * @module src/db/served-databases.js
 * @namespace ServedDatabases
 */

/** The databases the partitions of each context serve, by `<host><path>`. */
const servedDatabases = new Map();

/**
 * Records the databases the partitions of a context serve; none when each serves its own database.
 * @param {string} contextKey - `<host><path>`.
 * @param {string} signature - `<partition>=<database>` pairs, or `''`.
 * @memberof ServedDatabases
 */
export const recordServedDatabases = (contextKey, signature) => {
  if (signature) servedDatabases.set(contextKey, signature);
  else servedDatabases.delete(contextKey);
};

/**
 * The content data a context reads. A rebind, a rollback included, reads data of its own; the
 * partitions' own databases never share data with a bound database.
 * @param {string} contextKey - `<host><path>`.
 * @returns {string}
 * @memberof ServedDatabases
 */
export const contentDataKey = (contextKey) => {
  const served = servedDatabases.get(contextKey);
  return served ? `served@${served}` : 'base';
};
