/**
 * `underpost db collection` against a real MongoDB: inspect, clone, move and rename, with the File
 * documents a collection references (`file.ref.json`), opt-in aggregates, conflicts, resumption,
 * and a backup as a read-only source. Every database is a throwaway one.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import nodePath from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import {
  MongoCollectionOperations as Mongo,
  OPERATIONS_COLLECTION,
} from '../../../src/db/mongo/mongo-collection-operations.js';
import { MONGO_ARCHIVE_MAGIC, mongoArchiveTap } from '../../../src/server/storage/mongo-archive.js';
import { objectStore } from '../../../src/server/storage/object-store.js';
import { recordVerification, writeBackup } from '../../../src/server/storage/backup.js';
import UnderpostDB, { DR_BACKUP_PROFILE } from '../../../src/cli/db.js';

const { BSON } = mongoose.mongo;
const { ObjectId, Decimal128, Long, Double, Int32, Binary } = BSON;

const id = () => new ObjectId();
const bytes = (size) => crypto.randomBytes(size);
const fileDoc = (_id, data) => ({
  _id,
  name: `${_id}.png`,
  data: new Binary(data),
  size: new Int32(data.length),
  encoding: '7bit',
  mimetype: 'image/png',
  md5: crypto.createHash('md5').update(data).digest('hex'),
});

/** A mongodump archive of collections of a database, as `mongodump --archive` writes it. */
const archiveOf = async (db, collections) => {
  const terminator = Buffer.alloc(4, 0xff);
  const magic = Buffer.alloc(4);
  magic.writeUInt32LE(MONGO_ARCHIVE_MAGIC);
  const parts = [magic, BSON.serialize({ concurrent_collections: 1, version: '0.1', tool_version: 'test' })];
  for (const name of collections)
    parts.push(
      BSON.serialize({
        db: db.databaseName,
        collection: name,
        metadata: BSON.EJSON.stringify({ indexes: await db.collection(name).indexes(), options: {} }),
        size: 0,
        type: 'collection',
      }),
    );
  parts.push(terminator);
  for (const name of collections) {
    parts.push(BSON.serialize({ db: db.databaseName, collection: name, EOF: false }));
    for await (const raw of db.collection(name).find({}, { raw: true })) parts.push(Buffer.from(raw));
    parts.push(terminator, BSON.serialize({ db: db.databaseName, collection: name, EOF: true }), terminator);
  }
  return Buffer.concat(parts);
};

describe.skipIf(!mongodBinary)('collection operations', () => {
  let mongod;
  let client;
  const endpoints = [];
  const files = {};
  const companies = {};
  const users = {};

  const endpoint = async (name, database = '') => {
    const opened = await Mongo.openEndpoint({
      deployId: 'test',
      host: `${name}.test`,
      path: '/',
      db: { provider: 'mongoose', host: mongod.host, name },
      database,
    });
    endpoints.push(opened);
    return opened;
  };
  const layout = (aggregates = [], owner = 'user', collection = 'users') =>
    Mongo.layoutOf({ collection, owner, aggregates });
  const db = (name) => client.db(name);
  const sorted = async (database, collection) =>
    await db(database).collection(collection).find({}, { promoteValues: false }).sort({ _id: 1 }).toArray();

  /** The source database: users with Files and companies, a document that shares a File, and an unrelated company. */
  const seed = async (name) => {
    await db(name).dropDatabase();
    for (const key of ['avatar', 'shared', 'logo', 'unused', 'large']) files[key] = id();
    await db(name)
      .collection('files')
      .insertMany([
        fileDoc(files.avatar, bytes(200 * 1024)),
        fileDoc(files.shared, bytes(1024)),
        fileDoc(files.logo, bytes(512)),
        fileDoc(files.unused, bytes(64)),
        fileDoc(files.large, bytes(6 * 1024 * 1024)),
      ]);
    companies.used = id();
    companies.other = id();
    await db(name)
      .collection('companies')
      .insertMany([
        { _id: companies.used, name: 'Used', logo: files.logo },
        { _id: companies.other, name: 'Other' },
      ]);
    await db(name).collection('companies').createIndex({ name: 1 }, { unique: true });
    for (const key of ['ada', 'bob', 'cy', 'dee']) users[key] = id();
    await db(name)
      .collection('users')
      .insertMany([
        {
          _id: users.ada,
          email: 'ada@test',
          username: 'ada',
          profileImageId: files.avatar,
          associatedCompanies: [{ company: companies.used, context: ['owner'] }],
          balance: Decimal128.fromString('12.50'),
          visits: Long.fromString('9007199254740993'),
          ratio: new Double(5),
          level: new Int32(5),
          createdAt: new Date('2026-01-02T03:04:05Z'),
          tags: [['a', 'b'], ['c']],
        },
        { _id: users.bob, email: 'bob@test', username: 'bob', profileImageId: files.shared },
        { _id: users.cy, email: 'cy@test', username: 'cy', profileImageId: files.large },
        { _id: users.dee, email: 'dee@test', username: 'dee', profileImageId: null },
      ]);
    await db(name).collection('users').createIndex({ email: 1 }, { unique: true });
    await db(name).collection('users').createIndex({ username: 1 }, { unique: true });
    await db(name)
      .collection('documents')
      .insertOne({ _id: id(), title: 'Keeps the shared File', fileId: files.shared, userId: users.bob });
  };

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('collections');
    client = await new mongoose.mongo.MongoClient(`mongodb://${mongod.host}/?directConnection=true`).connect();
  }, 60000);

  afterAll(async () => {
    for (const opened of endpoints) await opened.close().catch(() => {});
    await client?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    for (const { name } of (await client.db().admin().listDatabases()).databases)
      if (!['admin', 'local', 'config'].includes(name)) await db(name).dropDatabase();
    await seed('source');
  });

  describe('layout', () => {
    it('reads the File references and an aggregate from the model schemas', async () => {
      const plan = await layout(['company']);
      expect(plan.fileFields).toEqual(['profileImageId']);
      expect(plan.files).toBe('files');
      expect(plan.aggregates).toEqual([
        { api: 'company', collection: 'companies', paths: ['associatedCompanies.company'], fileFields: ['logo'] },
      ]);
      expect(plan.relationships.map(({ ref }) => ref)).not.toContain('File');
    });

    it('refuses an unknown, implicit, self or undeclared aggregate', async () => {
      await expect(layout(['nothing'])).rejects.toThrow(/no API ships that model/);
      await expect(layout(['file'])).rejects.toThrow(/always go with their references/);
      await expect(layout(['user'])).rejects.toThrow(/transferred whole/);
      await expect(layout(['document'])).rejects.toThrow(/declares no reference to Document/);
      await expect(layout(['company'], '', 'loose')).rejects.toThrow(/no model owns loose/);
    });
  });

  describe('inspect', () => {
    it('reports documents, indexes, File references and the target state', async () => {
      const lost = { user: id(), file: id() };
      await db('source')
        .collection('users')
        .insertOne({ _id: lost.user, email: 'lost@test', username: 'lost', profileImageId: lost.file });
      const report = await Mongo.inspectCollection({
        source: await endpoint('source'),
        target: await endpoint('target'),
        layout: await layout(),
      });
      expect(report).toMatchObject({
        database: 'source',
        collection: 'users',
        owner: 'user',
        exists: true,
        documents: 5,
      });
      expect(report.indexes.map(({ name }) => name).sort()).toEqual(['email_1', 'username_1']);
      expect(report.fileReferences).toMatchObject({ paths: ['profileImageId'], distinct: 4, missingCount: 1 });
      expect(report.fileReferences.missing).toEqual([`users ${lost.user} -> File ${lost.file}`]);
      expect(report.relationships).toContainEqual({ path: 'associatedCompanies.company', ref: 'Company' });
      expect(report.target).toMatchObject({ database: 'target', exists: false, documents: 0, conflicts: [] });
      expect((await client.db('target').listCollections().toArray()).length).toBe(0);
    });
  });

  describe('clone', () => {
    it('plans without writing', async () => {
      const { plan, result } = await Mongo.cloneCollection({
        source: await endpoint('source'),
        target: await endpoint('target'),
        layout: await layout(['company']),
      });
      expect(result).toBeNull();
      expect(plan).toMatchObject({ documents: 4, conflicts: [], resume: null, fileSync: true });
      expect(plan.fileReferences).toMatchObject({ distinct: 4, missingCount: 0 });
      expect(plan.aggregates[0]).toMatchObject({ api: 'company', distinct: 1, missingCount: 0 });
      expect(plan.consistency).toMatchObject({ snapshot: false, transaction: false, sameServer: true });
      expect((await client.db('target').listCollections().toArray()).length).toBe(0);
    });

    it('copies the collection with its Files, ids, BSON types and indexes, and no aggregate unasked', async () => {
      const { result } = await Mongo.cloneCollection({
        source: await endpoint('source'),
        target: await endpoint('target'),
        layout: await layout(),
        batchSize: 2,
        apply: true,
      });
      expect(result).toMatchObject({ status: 'completed', copied: { documents: 4, files: 3 } });
      expect(result.verified).toEqual({ documents: 4, files: 3, missingFiles: 0, aggregates: {} });
      expect(await sorted('target', 'users')).toEqual(await sorted('source', 'users'));
      const [ada] = await db('target').collection('users').find({ _id: users.ada }, { promoteValues: false }).toArray();
      expect(ada.balance).toBeInstanceOf(Decimal128);
      expect(ada.visits.toString()).toBe('9007199254740993');
      expect(ada.ratio).toBeInstanceOf(Double);
      expect(ada.level).toBeInstanceOf(Int32);
      const copied = await sorted('target', 'files');
      expect(copied.map(({ _id }) => String(_id)).sort()).toEqual(
        [files.avatar, files.shared, files.large].map(String).sort(),
      );
      const [large] = await db('target').collection('files').find({ _id: files.large }).toArray();
      const [original] = await db('source').collection('files').find({ _id: files.large }).toArray();
      expect(Buffer.compare(large.data.buffer, original.data.buffer)).toBe(0);
      expect((await db('target').collection('users').indexes()).map(({ name }) => name).sort()).toEqual([
        '_id_',
        'email_1',
        'username_1',
      ]);
      expect(await db('target').listCollections({ name: 'companies' }).toArray()).toEqual([]);
      expect(await sorted('source', 'users')).toHaveLength(4);
      const [record] = await db('target').collection(OPERATIONS_COLLECTION).find().toArray();
      expect(record).toMatchObject({
        operation: 'clone',
        status: 'completed',
        stage: 'completed',
        collection: 'users',
      });
    });

    it('takes only the referenced aggregate documents, with their Files', async () => {
      const { result } = await Mongo.cloneCollection({
        source: await endpoint('source'),
        target: await endpoint('target'),
        layout: await layout(['company']),
        apply: true,
      });
      expect(result.copied).toMatchObject({ documents: 4, files: 4, aggregates: { company: 1 } });
      expect((await sorted('target', 'companies')).map(({ _id }) => String(_id))).toEqual([String(companies.used)]);
      expect(await db('target').collection('files').countDocuments({ _id: files.logo })).toBe(1);
      expect(await db('target').collection('files').countDocuments({ _id: files.unused })).toBe(0);
    });

    it('refuses a populated target, an incompatible index and a missing source File', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      await db('target').collection('users').insertOne({ _id: id(), email: 'x@test' });
      let { plan } = await Mongo.cloneCollection({ source, target, layout: await layout() });
      expect(plan.conflicts.join()).toMatch(/already holds 1 document/);
      await db('target').collection('users').deleteMany({});
      await db('target').collection('users').createIndex({ nickname: 1 });
      ({ plan } = await Mongo.cloneCollection({ source, target, layout: await layout() }));
      expect(plan.conflicts.join()).toMatch(/nickname_1 is not an index of the source/);
      await db('target').dropDatabase();
      await db('source').collection('files').deleteOne({ _id: files.shared });
      await expect(Mongo.cloneCollection({ source, target, layout: await layout(), apply: true })).rejects.toThrow(
        /1 referenced File document\(s\) are missing in the source/,
      );
      expect(await db('target').listCollections().toArray()).toEqual([]);
    });

    it('copies a reference to a File the source lacks only when allowed, and counts it', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      await db('source').collection('files').deleteOne({ _id: files.shared });
      const { plan } = await Mongo.cloneCollection({ source, target, layout: await layout(), allowMissingFiles: true });
      expect(plan.conflicts).toEqual([]);
      expect(plan.fileReferences.missing).toEqual([`users ${users.bob} -> File ${files.shared}`]);
      const { result } = await Mongo.cloneCollection({
        source,
        target,
        layout: await layout(),
        allowMissingFiles: true,
        apply: true,
      });
      expect(result.copied).toMatchObject({ documents: 4, files: 2, missingFiles: 1 });
      expect(result.verified).toMatchObject({ documents: 4, files: 2, missingFiles: 1 });
      const [bob] = await db('target').collection('users').find({ _id: users.bob }).toArray();
      expect(String(bob.profileImageId)).toBe(String(files.shared));
      const [record] = await db('target').collection(OPERATIONS_COLLECTION).find().toArray();
      expect(record).toMatchObject({ status: 'completed', allowMissingFiles: true });

      await db('target').dropDatabase();
      await db('target')
        .collection('files')
        .insertMany(await db('source').collection('files').find({}, { promoteValues: false }).toArray());
      const synced = await Mongo.cloneCollection({
        source,
        target,
        layout: await layout(),
        fileSync: false,
        allowMissingFiles: true,
        apply: true,
      });
      expect(synced.result.copied).toMatchObject({ documents: 4, files: 0, missingFiles: 1 });
    });

    it('treats an identical target File as present and stops on a conflicting one', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      const [avatar] = await db('source')
        .collection('files')
        .find({ _id: files.avatar }, { promoteValues: false })
        .toArray();
      const { _id, ...fields } = avatar;
      await db('target')
        .collection('files')
        .insertOne({ ...Object.fromEntries(Object.entries(fields).reverse()), _id });
      const { result } = await Mongo.cloneCollection({ source, target, layout: await layout(), apply: true });
      expect(result.copied.files).toBe(2);

      await db('target').dropDatabase();
      await db('target')
        .collection('files')
        .insertOne(fileDoc(files.avatar, bytes(16)));
      const error = await Mongo.cloneCollection({ source, target, layout: await layout(), apply: true }).catch(
        (e) => e,
      );
      expect(error.message).toMatch(/File document\(s\) of the target hold other content under the same _id/);
      const [record] = await db('target').collection(OPERATIONS_COLLECTION).find().toArray();
      expect(record).toMatchObject({ status: 'failed', failure: { stage: 'copy' } });
      expect(await sorted('source', 'users')).toHaveLength(4);
    });

    it('with File synchronization off, requires the target to hold each File', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      await expect(
        Mongo.cloneCollection({ source, target, layout: await layout(), fileSync: false, apply: true }),
      ).rejects.toThrow(/missing in the target, and File synchronization is disabled/);
      await db('target').dropDatabase();
      await db('target')
        .collection('files')
        .insertMany(await db('source').collection('files').find({}, { promoteValues: false }).toArray());
      const { result } = await Mongo.cloneCollection({
        source,
        target,
        layout: await layout(),
        fileSync: false,
        apply: true,
      });
      expect(result).toMatchObject({ status: 'completed', copied: { documents: 4, files: 0 } });
    });

    it('reports a unique index conflict of an aggregate', async () => {
      await db('target').collection('companies').createIndex({ name: 1 }, { unique: true });
      await db('target').collection('companies').insertOne({ _id: id(), name: 'Used' });
      await expect(
        Mongo.cloneCollection({
          source: await endpoint('source'),
          target: await endpoint('target'),
          layout: await layout(['company']),
          apply: true,
        }),
      ).rejects.toThrow(/E11000/);
    });

    it('resumes an interrupted copy and checks what it already wrote', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      await db('target')
        .collection('files')
        .insertOne(fileDoc(files.large, bytes(16)));
      await expect(
        Mongo.cloneCollection({ source, target, layout: await layout(), batchSize: 1, apply: true }),
      ).rejects.toThrow(/File document\(s\) of the target hold other content/);
      expect(await db('target').collection('users').countDocuments()).toBe(2);
      await db('target').collection('files').deleteOne({ _id: files.large });
      const { plan, result } = await Mongo.cloneCollection({
        source,
        target,
        layout: await layout(),
        batchSize: 1,
        apply: true,
      });
      expect(plan.resume).toMatchObject({ status: 'failed', stage: 'copy' });
      expect(result).toMatchObject({ status: 'completed', copied: { documents: 2, satisfied: 2 } });
      expect(await sorted('target', 'users')).toEqual(await sorted('source', 'users'));
      expect(await db('target').collection(OPERATIONS_COLLECTION).countDocuments()).toBe(1);
    });
  });

  describe('move', () => {
    it('stops after the verification without the confirmation, then deletes the source and its orphaned Files', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      const first = await Mongo.moveCollection({ source, target, layout: await layout(), apply: true });
      expect(first.result.status).toBe('verified');
      expect(await db('source').collection('users').countDocuments()).toBe(4);

      const second = await Mongo.moveCollection({
        source,
        target,
        layout: await layout(),
        apply: true,
        confirmSourceDelete: true,
      });
      expect(second.plan.resume).toMatchObject({ status: 'verified' });
      expect(second.result).toMatchObject({ status: 'completed', cleanup: { candidates: 3, removed: 2, kept: 1 } });
      expect(await db('source').listCollections({ name: 'users' }).toArray()).toEqual([]);
      const left = (
        await db('source')
          .collection('files')
          .find({}, { projection: { _id: 1 } })
          .toArray()
      ).map(({ _id }) => String(_id));
      expect(left.sort()).toEqual([files.shared, files.logo, files.unused].map(String).sort());
      expect(await sorted('target', 'users')).toHaveLength(4);
    });

    it('keeps the source when the verification fails', async () => {
      const source = await endpoint('source');
      const target = await endpoint('target');
      await Mongo.moveCollection({ source, target, layout: await layout(), apply: true });
      await db('target')
        .collection('users')
        .updateOne({ _id: users.bob }, { $set: { username: 'changed' } });
      await expect(
        Mongo.moveCollection({ source, target, layout: await layout(), apply: true, confirmSourceDelete: true }),
      ).rejects.toThrow(/users .* differs in the target/);
      expect(await db('source').collection('users').countDocuments()).toBe(4);
      expect(await db('source').collection('files').countDocuments()).toBe(5);
    });
  });

  describe('rename', () => {
    it('renames inside the database and keeps documents and indexes', async () => {
      const source = await endpoint('source');
      const { plan } = await Mongo.renameCollection({ source, layout: await layout(), to: 'members' });
      expect(plan).toMatchObject({ conflicts: [], documents: 4 });
      expect(plan.warning).toMatch(/update the model/);
      const { result } = await Mongo.renameCollection({ source, layout: await layout(), to: 'members', apply: true });
      expect(result.documents).toBe(4);
      expect(result.indexes.sort()).toEqual(['email_1', 'username_1']);
      expect(await db('source').listCollections({ name: 'users' }).toArray()).toEqual([]);
    });

    it('refuses an existing target name', async () => {
      await expect(
        Mongo.renameCollection({
          source: await endpoint('source'),
          layout: await layout(),
          to: 'documents',
          apply: true,
        }),
      ).rejects.toThrow(/collection documents already exists/);
    });
  });

  describe('a backup as the source', () => {
    let storeDir;
    const env = {};

    beforeAll(() => {
      storeDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-collection-store-'));
      for (const key of ['UNDERPOST_OBJECT_STORE', 'UNDERPOST_BACKUP_KEY']) env[key] = process.env[key];
      process.env.UNDERPOST_OBJECT_STORE = `file:${storeDir}`;
      process.env.UNDERPOST_BACKUP_KEY = crypto.randomBytes(32).toString('base64');
    });

    afterAll(() => {
      for (const [key, value] of Object.entries(env))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      fs.removeSync(storeDir);
    });

    const backUp = async () => {
      const archive = await archiveOf(db('source'), ['users', 'files', 'companies']);
      return await writeBackup({
        store: objectStore(),
        deployId: 'test',
        profile: DR_BACKUP_PROFILE,
        streams: [
          {
            name: 'mongodb-source',
            kind: 'mongodb',
            describe: { provider: 'mongoose', database: 'source', host: 'source.test', path: '/' },
            open: async () => Readable.from([archive]),
            tap: mongoArchiveTap,
          },
        ],
      });
    };
    const needs = [
      { database: 'source', collection: 'users' },
      { database: 'source', collection: 'files' },
    ];

    it('restores the collections into staging, clones from it and drops the staging', async () => {
      const manifest = await backUp();
      await db('source').collection('users').deleteMany({});
      const target = await endpoint('target');
      const { archives } = await UnderpostDB.API.backupArchives({
        deployId: 'test',
        backupId: manifest.backupId,
        needs,
      });
      const staged = await Mongo.stageArchives({
        server: target,
        of: Mongo.databaseLayout({ db: { name: 'source' } }),
        label: `backup ${manifest.backupId}`,
        archives,
        collections: ['users', 'files'],
      });
      expect(Object.values(staged.staged)).toEqual([4, 5]);
      const { result } = await Mongo.cloneCollection({ source: staged, target, layout: await layout(), apply: true });
      expect(result).toMatchObject({ status: 'completed', copied: { documents: 4, files: 3 } });
      expect(await db('source').collection('users').countDocuments()).toBe(0);
      await staged.close();
      const names = (await client.db().admin().listDatabases()).databases.map(({ name }) => name);
      expect(names.filter((name) => name.startsWith('underpost-staging-'))).toEqual([]);
      expect(
        fs.readdirSync(storeDir, { recursive: true }).filter((entry) => entry.endsWith('manifest.json')),
      ).toHaveLength(1);
    });

    it('prints the collections and documents of one backup from its manifest', async () => {
      const manifest = await backUp();
      const printed = [];
      const log = vi.spyOn(console, 'log').mockImplementation((line) => printed.push(line));
      const started = new Date(manifest.createdAt)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, ' UTC');
      try {
        const { streams, verification } = await UnderpostDB.API.inspectDeploy('test', null, {});
        expect(verification).toBeNull();
        expect(streams.map(({ name }) => name)).toEqual(['mongodb-source']);
        expect(printed[0]).toMatch(new RegExp(`^backup    ${manifest.backupId}  started ${started}`));
        expect(printed).toContain('verified  never');
        expect(printed.find((line) => line.includes('source.users'))).toMatch(/source\.users +4 documents  3 indexes/);
        expect(printed.find((line) => line.includes('source.files'))).toMatch(/5 documents  1 indexes/);
        printed.length = 0;
        const plan = [{ provider: 'mongoose', name: 'renamed', partitions: [], host: 'source.test', path: '/' }];
        const renamed = await UnderpostDB.API.inspectDeploy('test', plan, {
          backup: manifest.backupId,
          renameDatabase: 'source:renamed',
        });
        expect(renamed.streams.map(({ target }) => target)).toEqual(['renamed']);
        expect(printed.find((line) => line.startsWith('stream'))).toContain('source -> renamed');
        let warned = '';
        // The logger writes through the stream of the console.
        const write = vi.spyOn(console._stdout, 'write').mockImplementation((chunk) => (warned += `${chunk}`) && true);
        try {
          const unselected = await UnderpostDB.API.inspectDeploy('test', plan, { backup: manifest.backupId });
          expect(unselected.streams).toEqual([]);
        } finally {
          write.mockRestore();
        }
        expect(warned).toContain('holds no stream');
        expect(warned).toMatch(/"held": \[\s*"source"\s*\]/);
        expect(warned).toContain('--rename-database');
      } finally {
        log.mockRestore();
      }
    });

    it('refuses an unknown backup, a failed verification and a missing collection', async () => {
      await expect(
        UnderpostDB.API.backupArchives({ deployId: 'test', backupId: '20260101T000000Z-aaaaaa', needs }),
      ).rejects.toThrow(/not available/);
      const manifest = await backUp();
      await expect(
        UnderpostDB.API.backupArchives({
          deployId: 'test',
          backupId: manifest.backupId,
          needs: [{ database: 'other', collection: 'users' }],
        }),
      ).rejects.toThrow(/holds no archive of other.users/);
      await recordVerification({
        store: objectStore(),
        manifest,
        report: { backupId: manifest.backupId, ok: false, checkedAt: new Date(), checks: [] },
      });
      await expect(
        UnderpostDB.API.backupArchives({ deployId: 'test', backupId: manifest.backupId, needs }),
      ).rejects.toThrow(/failed its last verification/);
    });

    it('drops the staging when a restore fails', async () => {
      const target = await endpoint('target');
      const archive = await archiveOf(db('source'), ['users']);
      await expect(
        Mongo.stageArchives({
          server: target,
          of: Mongo.databaseLayout({ db: { name: 'source' } }),
          label: 'broken',
          archives: [{ database: 'source', open: () => Readable.from([archive.subarray(0, archive.length - 40)]) }],
          collections: ['users'],
        }),
      ).rejects.toThrow(/ends/);
      const names = (await client.db().admin().listDatabases()).databases.map(({ name }) => name);
      expect(names.filter((name) => name.startsWith('underpost-staging-'))).toEqual([]);
    });
  });
});
