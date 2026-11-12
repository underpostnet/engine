/**
 * The File reference registry: which model fields hold a File `_id`.
 *
 * `file.ref.json` is the single source of that mapping. The orphan sweep of `underpost db
 * --clean-fs-collection`, the collection operations of `underpost db collection`, and every writer
 * that deletes a document read it. A field path is a dot path: it may cross nested objects,
 * subdocuments and arrays of them.
 *
 * @module src/api/file/file.ref.js
 * @namespace FileReferenceRegistry
 */

import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { MongooseDB } from '../../db/mongo/mongoose-db.js';

// Resolved from this module: the CLI, the server and the test runner start in different directories.
const REGISTRY_PATH = fileURLToPath(new URL('./file.ref.json', import.meta.url));

/** The model name of the File collection, as schemas name it in `ref`. */
const FILE_MODEL = 'File';

let registry = null;

/**
 * @method fileRefRegistry
 * @description The parsed registry, read once per process.
 * @returns {Array<{api: string, model: Object}>} Registry entries.
 * @memberof FileReferenceRegistry
 */
const fileRefRegistry = () => (registry ??= JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')));

/**
 * @method fileRefApis
 * @description Every api that references File.
 * @returns {string[]} Api names.
 * @memberof FileReferenceRegistry
 */
const fileRefApis = () => fileRefRegistry().map((entry) => entry.api);

/**
 * @method fileRefFields
 * @description The File-referencing fields of one api, as dot paths.
 * @param {string} api - Api name, as registered.
 * @returns {string[]} Field paths, empty for an api that references no File.
 * @memberof FileReferenceRegistry
 */
const fileRefFields = (api) => {
  const walk = (node, prefix) =>
    Object.entries(node ?? {}).flatMap(([field, value]) => {
      const path = prefix ? `${prefix}.${field}` : field;
      if (value === true) return [path];
      return value && typeof value === 'object' ? walk(value, path) : [];
    });
  return walk(fileRefRegistry().find((entry) => entry.api === api)?.model, '');
};

/**
 * @method pathValues
 * @description The values a dot path reaches in a document, through every array on the way.
 * @param {*} value - A document or a value inside one.
 * @param {string[]} segments - The path, split on dots.
 * @returns {Array<*>} The non-null leaf values.
 * @memberof FileReferenceRegistry
 */
const pathValues = (value, segments) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => pathValues(entry, segments));
  if (!segments.length) return [value];
  return pathValues(value[segments[0]], segments.slice(1));
};

/**
 * @method documentFileRefs
 * @description The File references a set of documents holds, each once, with its stored type.
 * @param {Array<Object>} docs - Documents, lean or raw.
 * @param {string[]} fields - Field paths, as {@link fileRefFields} returns them.
 * @returns {Array<*>} Unique values, keyed by their string form.
 * @memberof FileReferenceRegistry
 */
const documentFileRefs = (docs, fields) => {
  const values = new Map();
  for (const doc of docs ?? [])
    for (const field of fields) for (const value of pathValues(doc, field.split('.'))) values.set(String(value), value);
  return [...values.values()];
};

/**
 * @method documentFileIds
 * @description The File ids a set of documents holds, as strings.
 * @param {Array<Object>} docs - Documents, lean or hydrated.
 * @param {string[]} fields - Field paths, as {@link fileRefFields} returns them.
 * @returns {string[]} Unique ids.
 * @memberof FileReferenceRegistry
 */
const documentFileIds = (docs, fields) => documentFileRefs(docs, fields).map(String);

/**
 * @method fileRefFilter
 * @description The filter that selects the documents holding any of `ids` in any of `fields`.
 * @param {string[]} fields - Field paths.
 * @param {Array<*>} ids - File ids, in the type the reader compares.
 * @returns {Object}
 * @memberof FileReferenceRegistry
 */
const fileRefFilter = (fields, ids) => ({ $or: fields.map((field) => ({ [field]: { $in: ids } })) });

/**
 * @method fileRefProjection
 * @description The projection that reads only the File reference fields.
 * @param {string[]} fields - Field paths.
 * @returns {Object<string, 1>}
 * @memberof FileReferenceRegistry
 */
const fileRefProjection = (fields) => Object.fromEntries(fields.map((field) => [field, 1]));

/**
 * @method heldFileIds
 * @description The candidates that a reader still references.
 * @param {Object} params
 * @param {Array<*>} params.ids - Candidate ids, in the type the readers compare.
 * @param {Array<{fields: string[], find: function(Object, Object): Promise<Object[]>}>} params.readers - One per
 *   collection: its File reference fields and a read of `(filter, projection)`.
 * @returns {Promise<Set<string>>} Held ids, as strings.
 * @memberof FileReferenceRegistry
 */
const heldFileIds = async ({ ids, readers }) => {
  const held = new Set();
  if (!ids?.length) return held;
  for (const { fields, find } of readers) {
    if (!fields?.length) continue;
    const docs = await find(fileRefFilter(fields, ids), fileRefProjection(fields));
    for (const id of documentFileIds(docs, fields)) held.add(id);
  }
  return held;
};

/** A reader of {@link heldFileIds} over a Mongoose model. */
const modelReader = (Model, fields) => ({
  fields,
  find: (filter, projection) => Model.find(filter, projection).lean(),
});

/**
 * @method deleteOwnedFiles
 * @description Deletes the File documents an owner collection no longer points at.
 *
 * An id still held by a surviving owner document is kept: renders are content
 * addressed, so two documents describing the same item resolve to the same File
 * id, and dropping one of them must not blind the other.
 * @param {Object} params
 * @param {import('mongoose').Model} params.File - File model.
 * @param {import('mongoose').Model|import('mongoose').Model[]} params.Owner - The collection that owns
 *   these ids, or every copy of it when the same collection lives in several databases.
 * @param {string[]} params.fields - Owner fields holding File ids.
 * @param {Array<*>} params.ids - Candidate ids, as read before the owners were deleted.
 * @returns {Promise<number>} How many File documents were removed.
 * @memberof FileReferenceRegistry
 */
const deleteOwnedFiles = async ({ File, Owner, fields, ids }) => {
  const candidates = [...new Set((ids ?? []).filter(Boolean).map(String))];
  if (candidates.length === 0) return 0;

  const owners = [Owner].flat().filter(Boolean);
  const held = await heldFileIds({ ids: candidates, readers: owners.map((owner) => modelReader(owner, fields)) });

  const removable = candidates.filter((id) => !held.has(id));
  if (removable.length === 0) return 0;
  const { deletedCount } = await File.deleteMany({ _id: { $in: removable } });
  return deletedCount ?? 0;
};

/**
 * @method deleteUnreferencedFiles
 * @description Deletes the candidates no registered model references any more.
 *
 * Refuses to delete anything while a registered api has no model in this
 * connection: an unreadable collection cannot be shown to hold no reference,
 * and a sweep that assumed otherwise would delete a live blob of another domain.
 * @param {Object} params
 * @param {import('mongoose').Model} params.File - File model.
 * @param {Array<*>} params.ids - Candidate ids.
 * @param {function(string): import('mongoose').Model} params.getModel - Resolves an api to its model, throwing when it is not loaded.
 * @returns {Promise<{removed: number, candidates: number, skipped: string}>} `skipped` names the api that could not be read, or is empty.
 * @memberof FileReferenceRegistry
 */
const deleteUnreferencedFiles = async ({ File, ids, getModel }) => {
  const candidates = [...new Set((ids ?? []).filter(Boolean).map(String))];
  if (candidates.length === 0) return { removed: 0, candidates: 0, skipped: '' };

  const readers = [];
  for (const api of fileRefApis()) {
    try {
      readers.push(modelReader(getModel(api), fileRefFields(api)));
    } catch {
      return { removed: 0, candidates: candidates.length, skipped: api };
    }
  }
  const held = await heldFileIds({ ids: candidates, readers });

  const removable = candidates.filter((id) => !held.has(id));
  if (removable.length === 0) return { removed: 0, candidates: candidates.length, skipped: '' };
  const { deletedCount } = await File.deleteMany({ _id: { $in: removable } });
  return { removed: deletedCount ?? 0, candidates: candidates.length, skipped: '' };
};

/**
 * @method fileRefDefects
 * @description Checks the registry against the model schemas. A registered api must have a model,
 * each registered path must be a File reference of its schema, and each File reference of any
 * api schema must be registered.
 * @returns {Promise<string[]>} One line per defect; empty when the registry is sound.
 * @memberof FileReferenceRegistry
 */
const fileRefDefects = async () => {
  const defects = [];
  const apis = MongooseDB.apis();
  const seen = new Set();
  for (const { api } of fileRefRegistry()) {
    if (seen.has(api)) defects.push(`${api}: registered twice`);
    seen.add(api);
    if (!apis.includes(api)) defects.push(`${api}: no api model src/api/${api}/${api}.model.js`);
  }
  for (const api of apis) {
    const declared = new Set(
      MongooseDB.referencesOf(await MongooseDB.schemaOf(api))
        .filter(({ ref }) => ref === FILE_MODEL)
        .map(({ path }) => path),
    );
    const registered = fileRefFields(api);
    for (const path of registered)
      if (!declared.has(path)) defects.push(`${api}.${path}: not a File reference of the ${api} schema`);
    for (const path of declared)
      if (!registered.includes(path)) defects.push(`${api}.${path}: File reference missing from file.ref.json`);
  }
  return defects;
};

export {
  FILE_MODEL,
  fileRefRegistry,
  fileRefApis,
  fileRefFields,
  documentFileRefs,
  documentFileIds,
  fileRefFilter,
  fileRefProjection,
  heldFileIds,
  deleteOwnedFiles,
  deleteUnreferencedFiles,
  fileRefDefects,
};
