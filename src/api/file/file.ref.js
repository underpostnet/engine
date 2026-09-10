/**
 * The File reference registry: which model fields hold a File `_id`.
 *
 * `file.ref.json` is the single source of that mapping — the orphan sweep in
 * `underpost db --clean-fs` reads it, and so does every writer that deletes a
 * document and has to take the blobs it owned with it. Reading it here rather
 * than restating the fields at each call site is what keeps a newly added
 * reference field from being cleaned up in one place and leaked in another.
 *
 * @module src/api/file/file.ref.js
 * @namespace FileReferenceRegistry
 */

import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

// Resolved from this module rather than the working directory: the CLI, the
// server and the test runner each start somewhere different.
const REGISTRY_PATH = fileURLToPath(new URL('./file.ref.json', import.meta.url));

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
 * @method documentFileIds
 * @description Collects the File ids a set of documents holds, as strings.
 * @param {Array<Object>} docs - Documents, lean or hydrated.
 * @param {string[]} fields - Field paths to read, as {@link fileRefFields} returns them.
 * @returns {string[]} Unique ids.
 * @memberof FileReferenceRegistry
 */
const documentFileIds = (docs, fields) => {
  const ids = new Set();
  const read = (doc, path) => path.split('.').reduce((value, part) => value?.[part], doc);
  for (const doc of docs ?? []) {
    for (const field of fields) {
      const value = read(doc, field);
      if (!value) continue;
      if (Array.isArray(value)) value.forEach((entry) => entry && ids.add(String(entry)));
      else ids.add(String(value));
    }
  }
  return [...ids];
};

/**
 * @method deleteOwnedFiles
 * @description Deletes the File documents an owner collection no longer points at.
 *
 * An id still held by a surviving owner document is kept: renders are content
 * addressed, so two documents describing the same item resolve to the same File
 * id, and dropping one of them must not blind the other.
 * @param {Object} params
 * @param {import('mongoose').Model} params.File - File model.
 * @param {import('mongoose').Model} params.Owner - The collection that owns these ids.
 * @param {string[]} params.fields - Owner fields holding File ids.
 * @param {Array<*>} params.ids - Candidate ids, as read before the owners were deleted.
 * @returns {Promise<number>} How many File documents were removed.
 * @memberof FileReferenceRegistry
 */
const deleteOwnedFiles = async ({ File, Owner, fields, ids }) => {
  const candidates = [...new Set((ids ?? []).filter(Boolean).map(String))];
  if (candidates.length === 0) return 0;

  const held = new Set();
  if (Owner && fields?.length) {
    const survivors = await Owner.find(
      { $or: fields.map((field) => ({ [field]: { $in: candidates } })) },
      Object.fromEntries(fields.map((field) => [field, 1])),
    ).lean();
    for (const id of documentFileIds(survivors, fields)) held.add(id);
  }

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

  const referenced = new Set();
  for (const api of fileRefApis()) {
    const fields = fileRefFields(api);
    if (fields.length === 0) continue;
    let Model;
    try {
      Model = getModel(api);
    } catch {
      return { removed: 0, candidates: candidates.length, skipped: api };
    }
    const docs = await Model.find(
      { $or: fields.map((field) => ({ [field]: { $in: candidates } })) },
      Object.fromEntries(fields.map((field) => [field, 1])),
    ).lean();
    for (const id of documentFileIds(docs, fields)) referenced.add(id);
  }

  const removable = candidates.filter((id) => !referenced.has(id));
  if (removable.length === 0) return { removed: 0, candidates: candidates.length, skipped: '' };
  const { deletedCount } = await File.deleteMany({ _id: { $in: removable } });
  return { removed: deletedCount ?? 0, candidates: candidates.length, skipped: '' };
};

export { fileRefRegistry, fileRefApis, fileRefFields, documentFileIds, deleteOwnedFiles, deleteUnreferencedFiles };
