'use strict';

/**
 * @module document-stable-slug.test
 * @description Covers the Document `stableSlug` lifecycle in `src/api/document/document.model.js`:
 * assignment on create, deterministic suffixes for duplicate titles, re-resolution when
 * concurrent inserts race for one slug, stability across title edits, and the idempotent
 * backfill that migrates documents created before the field existed.
 *
 * The statics run against an in-memory model whose writes enforce the unique slug index the
 * way MongoDB does — the check and the insert are one step, and a loser gets E11000 — whose reads
 * answer the model's two slug queries (a candidate prefix, or the documents missing a slug), and
 * whose `create` assigns a missing slug the way the schema's validate hook does. The hook itself, and
 * every other Mongoose create path, run against a real server in
 * `test/integration/app/document-stable-slug-mongodb.test.js`.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import { Types } from 'mongoose';
import { DocumentModel, DocumentSchema } from '../../src/api/document/document.model.js';

const duplicateSlug = (stableSlug) =>
  Object.assign(
    new Error(
      `E11000 duplicate key error collection: test.documents index: stableSlug_1 dup key: { stableSlug: "${stableSlug}" }`,
    ),
    { code: 11000 },
  );

const inMemoryDocuments = (initial = []) => {
  const docs = initial.map((doc) => ({ _id: new Types.ObjectId(), ...doc }));
  const indexes = [];
  const counters = { conflicts: 0, lookups: 0 };
  const hasSlug = (doc) => typeof doc.stableSlug === 'string' && doc.stableSlug !== '';
  const assertFree = (stableSlug) => {
    if (docs.some((doc) => doc.stableSlug === stableSlug)) {
      counters.conflicts++;
      throw duplicateSlug(stableSlug);
    }
  };

  class Documents {
    constructor(data) {
      Object.assign(this, data);
    }
    async save() {
      // Yield first so concurrent writers all reach the index check with the same stale read.
      await Promise.resolve();
      assertFree(this.stableSlug);
      docs.push({ _id: new Types.ObjectId(), ...this });
      return this;
    }
    static async create(data) {
      const doc = new Documents(data);
      if (!doc.stableSlug) doc.stableSlug = await Documents.nextStableSlug(doc.title);
      return await doc.save();
    }
    static find(filter) {
      const matched = filter.stableSlug.$regex
        ? docs.filter((doc) => hasSlug(doc) && new RegExp(filter.stableSlug.$regex).test(doc.stableSlug))
        : docs.filter((doc) => !hasSlug(doc));
      counters.lookups++;
      const ordered = [...matched].sort((a, b) => a.createdAt - b.createdAt);
      const query = {
        sort: () => query,
        lean: () => query,
        cursor: () => ordered.map((doc) => ({ ...doc })),
        then: (resolve) => resolve(matched.map((doc) => ({ ...doc }))),
      };
      return query;
    }
    static async countDocuments() {
      return docs.filter((doc) => !hasSlug(doc)).length;
    }
    static collection = {
      aggregate: () => {
        const groups = new Map();
        for (const doc of [...docs].sort((a, b) => a.createdAt - b.createdAt || `${a._id}`.localeCompare(`${b._id}`)))
          if (hasSlug(doc)) groups.set(doc.stableSlug, [...(groups.get(doc.stableSlug) ?? []), doc._id]);
        return [...groups].filter(([, ids]) => ids.length > 1).map(([slug, ids]) => ({ _id: slug, ids }));
      },
      updateMany: async ({ _id: { $in } }) => {
        let modifiedCount = 0;
        for (const doc of docs)
          if ($in.some((id) => id.equals(doc._id)) && hasSlug(doc)) {
            delete doc.stableSlug;
            modifiedCount++;
          }
        return { modifiedCount };
      },
      indexes: async () => indexes,
      dropIndex: async (name) =>
        indexes.splice(
          indexes.findIndex((index) => index.name === name),
          1,
        ),
      createIndex: async (keys, options) => indexes.push({ key: keys, ...options }),
      updateOne: async ({ _id }, { $set: { stableSlug } }) => {
        const doc = docs.find((candidate) => candidate._id.equals(_id));
        if (!doc || hasSlug(doc)) return { modifiedCount: 0 };
        assertFree(stableSlug);
        doc.stableSlug = stableSlug;
        return { modifiedCount: 1 };
      },
    };
  }
  Object.assign(Documents, DocumentSchema.statics);
  return { Documents, docs, indexes, counters };
};

describe('stable slug on create', () => {
  it('derives the slug from the title and ignores one supplied by the client', async () => {
    const { Documents } = inMemoryDocuments();
    const created = await Documents.createWithStableSlug({ title: 'How to Chat With GPT?', stableSlug: 'hijack' });
    expect(created.stableSlug).to.equal('how-to-chat-with-gpt');
  });

  it('suffixes duplicate titles deterministically', async () => {
    const { Documents } = inMemoryDocuments();
    const slugs = [];
    for (let i = 0; i < 3; i++)
      slugs.push((await Documents.createWithStableSlug({ title: 'How to Chat With GPT' })).stableSlug);
    expect(slugs).to.deep.equal(['how-to-chat-with-gpt', 'how-to-chat-with-gpt-2', 'how-to-chat-with-gpt-3']);
  });

  it('skips candidates already taken by other titles', async () => {
    const { Documents } = inMemoryDocuments([
      { title: 'Guide 2', stableSlug: 'guide-2' },
      { title: 'Guide', stableSlug: 'guide' },
    ]);
    expect((await Documents.createWithStableSlug({ title: 'Guide' })).stableSlug).to.equal('guide-3');
  });

  it('gives an empty title the fallback slug and numbers later ones', async () => {
    const { Documents } = inMemoryDocuments();
    expect((await Documents.createWithStableSlug({ title: '' })).stableSlug).to.equal('untitled');
    expect((await Documents.createWithStableSlug({ title: '???' })).stableSlug).to.equal('untitled-2');
  });

  it('re-resolves when concurrent inserts race for the same slug', async () => {
    const { Documents, docs, counters } = inMemoryDocuments();
    const created = await Promise.all(
      Array.from({ length: 4 }, () => Documents.createWithStableSlug({ title: 'Launch Notes' })),
    );
    expect(counters.conflicts).to.be.above(0);
    expect(created.map((doc) => doc.stableSlug).sort()).to.deep.equal([
      'launch-notes',
      'launch-notes-2',
      'launch-notes-3',
      'launch-notes-4',
    ]);
    expect(new Set(docs.map((doc) => doc.stableSlug)).size).to.equal(docs.length);
  });

  it('surfaces errors that are not slug conflicts', async () => {
    const { Documents } = inMemoryDocuments();
    Documents.prototype.save = async () => {
      throw Object.assign(new Error('E11000 duplicate key error index: email_1'), { code: 11000 });
    };
    let error;
    try {
      await Documents.createWithStableSlug({ title: 'Anything' });
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).to.match(/email_1/);
  });
});

describe('stable slug after create', () => {
  it('keeps the slug when the title changes', () => {
    const doc = DocumentModel.hydrate({
      _id: new Types.ObjectId(),
      title: 'How to Chat With GPT',
      stableSlug: 'how-to-chat-with-gpt',
    });
    doc.title = 'How to Chat With GPT Efficiently';
    doc.stableSlug = 'how-to-chat-with-gpt-efficiently';
    expect(doc.title).to.equal('How to Chat With GPT Efficiently');
    expect(doc.stableSlug).to.equal('how-to-chat-with-gpt');
  });

  it('rejects a slug outside the route format', async () => {
    const slugError = (data) =>
      new DocumentModel(data).validate().then(
        () => undefined,
        (error) => error.errors.stableSlug,
      );
    expect(await slugError({ title: 'x', stableSlug: 'Not A Slug' })).to.exist;
    expect(await slugError({ title: 'x', stableSlug: `${'a'.repeat(81)}` })).to.exist;
    expect(await slugError({ title: 'x', stableSlug: 'a-slug' })).to.equal(undefined);
  });

  it('lets a document from before the field existed be saved without one', async () => {
    const legacy = DocumentModel.hydrate({ _id: new Types.ObjectId(), title: 'Old post' });
    legacy.isPublic = true;
    expect(await legacy.validate().then(() => undefined)).to.equal(undefined);
  });
});

describe('stable slug backfill', () => {
  const legacyCollection = () =>
    inMemoryDocuments([
      { title: 'Hello World', stableSlug: 'hello-world', createdAt: 5 },
      { title: 'Hello World', createdAt: 2 },
      { title: 'Hello, World!', createdAt: 1 },
      { title: '', createdAt: 3 },
      { title: 'Notes', stableSlug: null, createdAt: 4 },
    ]);

  it('assigns every missing slug, oldest document first', async () => {
    const { Documents, docs, indexes } = legacyCollection();
    expect(await Documents.ensureStableSlugs()).to.deep.equal({ reassigned: 0, assigned: 4, remaining: 0 });
    expect([...docs].sort((a, b) => a.createdAt - b.createdAt).map((doc) => doc.stableSlug)).to.deep.equal([
      'hello-world-2',
      'hello-world-3',
      'untitled',
      'notes',
      'hello-world',
    ]);
    expect(indexes).to.have.length(1);
    expect(indexes[0]).to.include({ name: 'stableSlug_1', unique: true });
    expect(indexes[0].partialFilterExpression).to.deep.equal({ stableSlug: { $type: 'string' } });
  });

  it('changes nothing on a second run', async () => {
    const { Documents, docs, indexes } = legacyCollection();
    await Documents.ensureStableSlugs();
    const before = docs.map((doc) => doc.stableSlug);
    expect(await Documents.ensureStableSlugs()).to.deep.equal({ reassigned: 0, assigned: 0, remaining: 0 });
    expect(docs.map((doc) => doc.stableSlug)).to.deep.equal(before);
    expect(indexes).to.have.length(1);
  });

  it('replaces a slug index that does not enforce uniqueness', async () => {
    const { Documents, indexes } = inMemoryDocuments();
    indexes.push({ name: 'stableSlug_1', key: { stableSlug: 1 } });
    await Documents.ensureStableSlugs();
    expect(indexes).to.have.length(1);
    expect(indexes[0].unique).to.equal(true);
  });

  it('keeps a duplicated slug on the oldest document and reassigns the rest', async () => {
    const { Documents, docs } = inMemoryDocuments([
      { title: 'Twice', stableSlug: 'twice', createdAt: 2 },
      { title: 'Twice', stableSlug: 'twice', createdAt: 1 },
      { title: 'Twice', stableSlug: 'twice', createdAt: 3 },
    ]);
    expect(await Documents.ensureStableSlugs()).to.deep.equal({ reassigned: 2, assigned: 2, remaining: 0 });
    expect([...docs].sort((a, b) => a.createdAt - b.createdAt).map((doc) => doc.stableSlug)).to.deep.equal([
      'twice',
      'twice-2',
      'twice-3',
    ]);
  });
});
