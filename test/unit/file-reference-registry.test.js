'use strict';

/**
 * @module file-reference-registry.test
 * @description Covers `src/api/file/file.ref.js`: the mapping of a model to the fields that hold
 * a File `_id`, and the two deletions built on it. Every writer that removes a document reads
 * this registry to take the blobs it owned with it, so what is asserted here is what keeps the
 * File collection free of unreachable documents.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import {
  deleteOwnedFiles,
  deleteUnreferencedFiles,
  documentFileIds,
  fileRefApis,
  fileRefFields,
} from '../../src/api/file/file.ref.js';

/** Minimal collection: the helpers only run `find(filter, projection).lean()` and `deleteMany`. */
const collection = (docs) => ({
  docs,
  find(filter) {
    const clauses = filter.$or ?? [filter];
    const matched = docs.filter((doc) =>
      clauses.some((clause) =>
        Object.entries(clause).every(([field, condition]) => {
          const value = doc[field];
          if (value === undefined || value === null) return false;
          return condition.$in.map(String).includes(String(value));
        }),
      ),
    );
    return { lean: async () => matched };
  },
  async deleteMany({ _id: { $in } }) {
    const removing = new Set($in.map(String));
    const before = docs.length;
    this.docs = docs = docs.filter((doc) => !removing.has(String(doc._id)));
    return { deletedCount: before - docs.length };
  },
});

describe('the File reference registry', () => {
  it('answers the fields of a registered api and nothing for an unregistered one', () => {
    expect(fileRefFields('atlas-sprite-sheet')).to.deep.equal(['fileId', 'minifyFileId']);
    expect(fileRefFields('cyberia-map')).to.deep.equal(['thumbnail', 'preview']);
    expect(fileRefFields('object-layer')).to.deep.equal([]);
    expect(fileRefApis()).to.include('cyberia-audio');
  });

  it('reads ids out of documents by field, skipping the ones that hold none', () => {
    const docs = [{ fileId: 'a', minifyFileId: 'b' }, { fileId: 'a' }, { minifyFileId: null }];
    expect(documentFileIds(docs, ['fileId', 'minifyFileId'])).to.deep.equal(['a', 'b']);
  });
});

describe('deleting the files a collection owned', () => {
  it('removes the ids no surviving document holds', async () => {
    const files = collection([{ _id: 'atlas-1' }, { _id: 'minify-1' }, { _id: 'unrelated' }]);
    const atlases = collection([]);

    const removed = await deleteOwnedFiles({
      File: files,
      Owner: atlases,
      fields: ['fileId', 'minifyFileId'],
      ids: ['atlas-1', 'minify-1'],
    });

    expect(removed).to.equal(2);
    expect(files.docs.map((doc) => doc._id)).to.deep.equal(['unrelated']);
  });

  it('keeps an id a survivor still points at', async () => {
    // Renders are content addressed, so a duplicate document of the same item resolves to the
    // same File id. Dropping the duplicate must not blind the document that remains.
    const files = collection([{ _id: 'shared' }, { _id: 'gone' }]);
    const atlases = collection([{ _id: 'survivor', fileId: 'shared', minifyFileId: null }]);

    const removed = await deleteOwnedFiles({
      File: files,
      Owner: atlases,
      fields: ['fileId', 'minifyFileId'],
      ids: ['shared', 'gone'],
    });

    expect(removed).to.equal(1);
    expect(files.docs.map((doc) => doc._id)).to.deep.equal(['shared']);
  });

  it('deletes nothing when handed no candidates', async () => {
    const files = collection([{ _id: 'kept' }]);
    expect(await deleteOwnedFiles({ File: files, Owner: collection([]), fields: ['fileId'], ids: [] })).to.equal(0);
    expect(files.docs).to.have.lengthOf(1);
  });
});

describe('sweeping files no registered model references', () => {
  const loadedModels = (overrides = {}) => {
    const models = Object.fromEntries(fileRefApis().map((api) => [api, collection([])]));
    return { ...models, ...overrides };
  };

  it('refuses to delete while a registered api has no model to read', async () => {
    // An unreadable collection cannot be shown to hold no reference, and a sweep that assumed
    // otherwise would delete a live blob belonging to another domain.
    const files = collection([{ _id: 'candidate' }]);
    const models = loadedModels();
    delete models.document;

    const result = await deleteUnreferencedFiles({
      File: files,
      ids: ['candidate'],
      getModel: (api) => {
        if (!models[api]) throw new Error(`Model not loaded: ${api}`);
        return models[api];
      },
    });

    expect(result.skipped).to.equal('document');
    expect(result.removed).to.equal(0);
    expect(files.docs).to.have.lengthOf(1);
  });

  it('deletes only the candidates every model agrees it never references', async () => {
    const files = collection([{ _id: 'orphan' }, { _id: 'held' }]);
    const models = loadedModels({ 'cyberia-map': collection([{ _id: 'map', thumbnail: 'held', preview: null }]) });

    const result = await deleteUnreferencedFiles({
      File: files,
      ids: ['orphan', 'held'],
      getModel: (api) => models[api],
    });

    expect(result.skipped).to.equal('');
    expect(result.removed).to.equal(1);
    expect(files.docs.map((doc) => doc._id)).to.deep.equal(['held']);
  });
});
