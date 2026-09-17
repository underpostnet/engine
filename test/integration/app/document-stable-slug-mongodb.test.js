'use strict';

/**
 * @module document-stable-slug-mongodb.test
 * @description Runs the Document `stableSlug` lifecycle against a real MongoDB server with the
 * real Mongoose schema: the unique partial index, duplicate-key handling, every Mongoose create
 * path, concurrent creation of one title, title edits, and the one-shot migration — on legacy
 * documents, on duplicated slugs, over a large collection, twice, and across a reconnect.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise, so the tier
 * still runs where no server can be started.
 *
 * Uses 'chai' for assertions.
 */

import mongoose from 'mongoose';
import { expect } from 'chai';
import { DocumentSchema } from '../../../src/api/document/document.model.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const connect = async (uri) => {
  const connection = await mongoose.createConnection(uri, { autoIndex: false }).asPromise();
  return { connection, Document: connection.model('Document', DocumentSchema) };
};

const insertRaw = (Document, docs) => Document.collection.insertMany(docs);

describe.skipIf(!mongodBinary)('Document stable slugs on MongoDB', () => {
  let mongod;
  let connection;
  let Document;

  beforeAll(async () => {
    mongod = await startMongod('stable-slug-test');
    ({ connection, Document } = await connect(mongod.uri));
  }, 60000);

  afterAll(async () => {
    await connection?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await Document.collection.drop().catch(() => {});
  });

  const slugIndex = async () => (await Document.collection.indexes()).find((index) => index.name === 'stableSlug_1');

  describe('create paths', () => {
    it('assigns the slug on save, create and insertMany alike', async () => {
      await Document.ensureStableSlugs();
      const saved = await new Document({ title: 'How to Chat With GPT?' }).save();
      const created = await Document.create({ title: 'How to Chat With GPT' });
      const [inserted] = await Document.insertMany([{ title: 'How to chat with GPT!' }]);
      expect([saved.stableSlug, created.stableSlug, inserted.stableSlug]).to.deep.equal([
        'how-to-chat-with-gpt',
        'how-to-chat-with-gpt-2',
        'how-to-chat-with-gpt-3',
      ]);
      expect((await Document.findById(inserted._id)).stableSlug).to.equal('how-to-chat-with-gpt-3');
    });

    it('keeps an explicit slug (an import preserving a published URL) and refuses a malformed one', async () => {
      await Document.ensureStableSlugs();
      const imported = await Document.create({ title: 'Imported', stableSlug: 'kept-from-elsewhere' });
      expect(imported.stableSlug).to.equal('kept-from-elsewhere');
      const error = await Document.create({ title: 'x', stableSlug: 'Not A Slug' }).catch((caught) => caught);
      expect(error.errors?.stableSlug).to.exist;
    });

    it('never persists a client-supplied slug through the REST create path', async () => {
      await Document.ensureStableSlugs();
      const created = await Document.createWithStableSlug({ title: 'Client Title', stableSlug: 'hijacked' });
      expect(created.stableSlug).to.equal('client-title');
    });

    it('resolves concurrent creates of one title to distinct slugs under the unique index', async () => {
      await Document.ensureStableSlugs();
      const created = await Promise.all(
        Array.from({ length: 12 }, () => Document.createWithStableSlug({ title: 'Launch Notes' })),
      );
      const slugs = created.map((doc) => doc.stableSlug).sort();
      expect(new Set(slugs).size).to.equal(12);
      expect(slugs).to.include.members(['launch-notes', 'launch-notes-2', 'launch-notes-12']);
      expect(await Document.countDocuments({ stableSlug: { $regex: /^launch-notes/ } })).to.equal(12);
    });

    it('rejects a duplicate slug at the database even when written around the model', async () => {
      await Document.ensureStableSlugs();
      await Document.create({ title: 'Taken' });
      const error = await insertRaw(Document, [{ title: 'Taken again', stableSlug: 'taken' }]).catch(
        (caught) => caught,
      );
      expect(error.code).to.equal(11000);
    });
  });

  describe('update semantics', () => {
    it('keeps the slug when the title changes, through save and through findByIdAndUpdate', async () => {
      await Document.ensureStableSlugs();
      const doc = await Document.create({ title: 'How to Chat With GPT' });
      doc.title = 'How to Chat With GPT Efficiently';
      doc.stableSlug = 'how-to-chat-with-gpt-efficiently';
      await doc.save();
      await Document.findByIdAndUpdate(doc._id, { title: 'Renamed twice', stableSlug: 'renamed-twice' });
      const stored = await Document.findById(doc._id);
      expect(stored.title).to.equal('Renamed twice');
      expect(stored.stableSlug).to.equal('how-to-chat-with-gpt');
    });

    it('lets a document from before the field existed be saved before it is migrated', async () => {
      await insertRaw(Document, [{ title: 'Old post', isPublic: false }]);
      const legacy = await Document.findOne({ title: 'Old post' });
      legacy.isPublic = true;
      await legacy.save();
      expect((await Document.findById(legacy._id)).isPublic).to.equal(true);
    });
  });

  describe('migration', () => {
    it('builds the unique partial index and assigns every missing slug, oldest first', async () => {
      await insertRaw(Document, [
        { title: 'Hello World', createdAt: new Date(2), isPublic: true },
        { title: 'Hello, World!', createdAt: new Date(1) },
        { title: '', createdAt: new Date(3) },
        { title: 'Notes', stableSlug: null, createdAt: new Date(4) },
      ]);
      expect(await Document.ensureStableSlugs()).to.deep.equal({ reassigned: 0, assigned: 4, remaining: 0 });
      const slugs = (await Document.find().sort({ createdAt: 1 }).lean()).map((doc) => doc.stableSlug);
      expect(slugs).to.deep.equal(['hello-world', 'hello-world-2', 'untitled', 'notes']);
      const index = await slugIndex();
      expect(index.unique).to.equal(true);
      expect(index.partialFilterExpression).to.deep.equal({ stableSlug: { $type: 'string' } });
    });

    it('keeps a duplicated slug on the oldest document and reassigns the rest', async () => {
      await insertRaw(Document, [
        { title: 'Twice', stableSlug: 'twice', createdAt: new Date(2) },
        { title: 'Twice', stableSlug: 'twice', createdAt: new Date(1) },
        { title: 'Twice', stableSlug: 'twice', createdAt: new Date(3) },
      ]);
      expect(await Document.ensureStableSlugs()).to.deep.equal({ reassigned: 2, assigned: 2, remaining: 0 });
      const slugs = (await Document.find().sort({ createdAt: 1 }).lean()).map((doc) => doc.stableSlug);
      expect(slugs).to.deep.equal(['twice', 'twice-2', 'twice-3']);
      expect((await slugIndex()).unique).to.equal(true);
    });

    it('replaces a slug index that does not enforce uniqueness', async () => {
      await Document.collection.createIndex({ stableSlug: 1 }, { name: 'stableSlug_1' });
      await Document.ensureStableSlugs();
      const index = await slugIndex();
      expect(index.unique).to.equal(true);
      expect((await Document.collection.indexes()).filter((i) => i.key.stableSlug)).to.have.length(1);
    });

    it('changes nothing on a second run and after a reconnect', async () => {
      await insertRaw(Document, [{ title: 'Once' }, { title: 'Once' }]);
      await Document.ensureStableSlugs();
      const before = (await Document.find().sort({ _id: 1 }).lean()).map((doc) => doc.stableSlug);
      expect(await Document.ensureStableSlugs()).to.deep.equal({ reassigned: 0, assigned: 0, remaining: 0 });
      const again = await connect(mongod.uri);
      try {
        expect(await again.Document.ensureStableSlugs()).to.deep.equal({ reassigned: 0, assigned: 0, remaining: 0 });
        expect((await again.Document.find().sort({ _id: 1 }).lean()).map((doc) => doc.stableSlug)).to.deep.equal(
          before,
        );
      } finally {
        await again.connection.close();
      }
    });

    it('migrates a large collection with many shared titles', async () => {
      const titles = ['Release notes', 'Weekly update', 'How to Chat With GPT'];
      await insertRaw(
        Document,
        Array.from({ length: 3000 }, (_, i) => ({ title: titles[i % titles.length], createdAt: new Date(i) })),
      );
      const result = await Document.ensureStableSlugs();
      expect(result).to.deep.equal({ reassigned: 0, assigned: 3000, remaining: 0 });
      expect(await Document.countDocuments({ stableSlug: { $type: 'string' } })).to.equal(3000);
      expect((await Document.collection.distinct('stableSlug')).length).to.equal(3000);
      expect(await Document.countDocuments({ stableSlug: 'release-notes' })).to.equal(1);
      expect(await Document.countDocuments({ stableSlug: 'release-notes-1000' })).to.equal(1);
    }, 60000);

    it('leaves the application creating documents while it runs', async () => {
      await insertRaw(
        Document,
        Array.from({ length: 300 }, (_, i) => ({ title: 'Shared title', createdAt: new Date(i) })),
      );
      await Document.ensureStableSlugs();
      await insertRaw(
        Document,
        Array.from({ length: 300 }, (_, i) => ({ title: 'Shared title', createdAt: new Date(1000 + i) })),
      );
      const [migration, created] = await Promise.all([
        Document.ensureStableSlugs(),
        Promise.all(Array.from({ length: 20 }, () => Document.createWithStableSlug({ title: 'Shared title' }))),
      ]);
      expect(migration.remaining).to.equal(0);
      expect(created.map((doc) => doc.stableSlug)).to.have.length(20);
      expect((await Document.collection.distinct('stableSlug')).length).to.equal(620);
    }, 60000);
  });
});
