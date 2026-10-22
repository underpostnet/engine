/**
 * One MongoDB transaction of the player service, and the classes of its failures. `withTransaction`
 * runs the work again on a transient error and on an unknown commit result, so the work reads and
 * writes only through its session.
 *
 * @module src/projects/cyberia/player/transaction.js
 */
import mongoose from 'mongoose';

/** Server codes of a write refused as it stands: duplicate key, document validation, document too large. */
const INTEGRITY_CODES = new Set([11000, 11001, 121, 10334]);

/**
 * @template T
 * @param {import('mongoose').Model} Model - Any model of the database.
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} work
 * @returns {Promise<T>}
 */
const runTransaction = async (Model, work) => {
  const session = await Model.db.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Whether the database refused a write as it stands: a retry of the same write fails the same way
 * until an operator repairs the records or the indexes.
 * @param {Error} error
 * @returns {boolean}
 */
const integrityFailure = (error) =>
  !error?.hasErrorLabel?.('TransientTransactionError') &&
  (INTEGRITY_CODES.has(error?.code) || ['ValidationError', 'CastError'].includes(error?.name));

/**
 * Whether a MongoDB failure left a write undone that a retry may complete: any database error but
 * an integrity failure.
 * @param {Error} error
 * @returns {boolean}
 */
const databaseFailure = (error) => error instanceof mongoose.mongo.MongoError && !integrityFailure(error);

export { databaseFailure, integrityFailure, runTransaction };
