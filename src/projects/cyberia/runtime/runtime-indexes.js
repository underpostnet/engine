/**
 * The indexes of the Cyberia runtime records: the collections of `CYBERIA_RUNTIME_APIS` in the host
 * database. Their models declare every index these collections hold, so a sync makes the stored
 * indexes the declared ones: it deletes the unkeyed records, drops each index no model declares,
 * then builds each missing one. Two records that share a complete unique key stop the build of
 * their model with the MongoDB error, which names the key.
 *
 * Production builds no index on its own (`autoIndex` is off): the deploy runs the sync on the
 * deployed image before the rollout. Platform collections build their own indexes, and a content
 * release database syncs its indexes when it is built.
 *
 * @module src/projects/cyberia/runtime/runtime-indexes.js
 * @namespace CyberiaRuntimeIndexes
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { getCapVariableName } from '../../../client/components/core/CommonJs.js';
import { CYBERIA_RUNTIME_APIS } from '../stack/domain-ownership.js';

/**
 * The runtime models of a host by name.
 * @param {{host: string, path: string}} context
 * @returns {Object<string, import('mongoose').Model>}
 * @memberof CyberiaRuntimeIndexes
 */
export const runtimeModels = (context) =>
  Object.fromEntries(
    CYBERIA_RUNTIME_APIS.map(getCapVariableName).map((name) => [name, DataBaseProviderService.getModel(name, context)]),
  );

/**
 * The filter of the unkeyed records of a schema: records without a required field of a unique key
 * that covers every record. No read reaches them, and the index keys all of them under null.
 * @param {import('mongoose').Schema} schema
 * @returns {Object|null} Null when no unique key has a required field.
 * @memberof CyberiaRuntimeIndexes
 */
export const unkeyedFilter = (schema) => {
  const fields = new Set();
  for (const [key, { unique, sparse, partialFilterExpression }] of schema.indexes())
    if (unique && !sparse && !partialFilterExpression)
      for (const field of Object.keys(key)) if (schema.paths[field]?.options.required === true) fields.add(field);
  return fields.size ? { $or: [...fields].map((field) => ({ [field]: null })) } : null;
};

/**
 * Compares the stored indexes and records of each model with the declared ones and, with `apply`,
 * deletes the unkeyed records, then syncs the indexes. Idempotent: a second sync changes nothing.
 * @param {Object<string, import('mongoose').Model>} models - {@link runtimeModels}.
 * @param {{apply?: boolean}} [options]
 * @returns {Promise<{ready: boolean, models: Array<{model: string, deleted: number, toDelete: number, toDrop: string[], toCreate: Object[], error: string}>}>}
 *   Per model: the unkeyed records this sync deleted, and what still differs: the unkeyed records,
 *   the stored indexes no model declares, the declared keys not stored, and the error that stopped
 *   its sync. Ready when nothing differs.
 * @memberof CyberiaRuntimeIndexes
 */
export async function syncRuntimeIndexes(models, { apply = false } = {}) {
  const report = [];
  for (const [model, Model] of Object.entries(models)) {
    const unkeyed = unkeyedFilter(Model.schema);
    let deleted = 0;
    let error = '';
    if (apply)
      try {
        if (unkeyed) deleted = (await Model.deleteMany(unkeyed)).deletedCount;
        await Model.syncIndexes();
      } catch (failure) {
        error = failure.message;
      }
    const toDelete = unkeyed ? await Model.countDocuments(unkeyed) : 0;
    const { toDrop, toCreate } = await Model.diffIndexes();
    report.push({ model, deleted, toDelete, toDrop, toCreate, error });
  }
  return {
    ready: report.every(
      ({ toDelete, toDrop, toCreate, error }) => !error && toDelete + toDrop.length + toCreate.length === 0,
    ),
    models: report,
  };
}
