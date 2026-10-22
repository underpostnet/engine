/**
 * Optimistic concurrency of a stored document that carries a `revision`.
 *
 * @module src/server/storage/revision.js
 */

/**
 * The filter that matches a document only at the revision it was read at, and the revision the
 * write sets. A document stored before it carried a revision reads as revision 1.
 * @param {{_id: *, revision?: number}} document - The document as it was read.
 * @returns {{filter: Object, next: number}}
 */
export const revisionGuard = ({ _id, revision = 1 }) => ({
  filter: { _id, revision: revision === 1 ? { $in: [1, null] } : revision },
  next: revision + 1,
});
