import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import {
  inspectMongoArchive,
  mongoArchiveTap,
  readMongoArchive,
  restoreMongoArchive,
} from '../../../src/server/storage/mongo-archive.js';

// Needs `mongod`: `UNDERPOST_MONGOD_BIN`, or one on PATH. The fixture is real `mongodump --archive --gzip`
// output of database `fixture`: `users` (typed values, a unique index), `empty`, and 1200 `rows`.
const { BSON } = mongoose.mongo;
const FIXTURE = new URL('../../support/mongodump-fixture.archive.gz', import.meta.url);
const gzip = () => fs.createReadStream(FIXTURE);
const plain = () => Readable.from([zlib.gunzipSync(fs.readFileSync(FIXTURE))]);
const RECORDED = {
  'fixture.users': { documents: 2, indexes: 2, kind: 'collection' },
  'fixture.empty': { documents: 0, indexes: 1, kind: 'collection' },
  'fixture.rows': { documents: 1200, indexes: 1, kind: 'collection' },
};

describe('a mongodump archive read without the Database Tools', () => {
  it('inventories a gzip or a plain archive alike', async () => {
    const fromGzip = await inspectMongoArchive(gzip());
    expect(fromGzip).toMatchObject({ toolVersion: '100.13.0', serverVersion: '8.0.14' });
    expect(fromGzip.namespaces).toEqual(RECORDED);
    expect((await inspectMongoArchive(plain())).namespaces).toEqual(RECORDED);
  });

  it('reads the archive as a tap of the bytes a backup stores', async () => {
    const tap = mongoArchiveTap();
    for await (const chunk of gzip()) tap.write(chunk);
    expect((await tap.end()).namespaces).toEqual(RECORDED);
  });

  it('refuses a stream that is not an archive, or ends inside one', async () => {
    await expect(inspectMongoArchive(Readable.from([Buffer.from('not an archive')]))).rejects.toThrow(
      /not a mongodump archive/,
    );
    await expect(inspectMongoArchive(Readable.from([]))).rejects.toThrow(/empty/);
    const whole = zlib.gunzipSync(fs.readFileSync(FIXTURE));
    await expect(inspectMongoArchive(Readable.from([whole.subarray(0, whole.length - 100)]))).rejects.toThrow(/ends/);
  });

  it('says when each namespace is complete', async () => {
    const ends = [];
    for await (const event of readMongoArchive(gzip()))
      if (event.type === 'end') ends.push(`${event.db}.${event.collection}`);
    expect(ends.sort()).toEqual(Object.keys(RECORDED).sort());
  });
});

describe.skipIf(!mongodBinary)('a mongodump archive restored through the driver', () => {
  let mongod;
  let client;

  beforeAll(async () => {
    mongod = await startMongod('dump');
    client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
  }, 60000);

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  it('restores every collection with its BSON types, identifiers, options and indexes', async () => {
    const { restored, skipped } = await restoreMongoArchive({ client, source: gzip(), target: () => 'restored' });
    expect(restored).toEqual({ 'restored.users': 2, 'restored.empty': 0, 'restored.rows': 1200 });
    expect(skipped).toEqual([]);
    const db = client.db('restored');
    const [ana] = await db.collection('users').find({ name: 'ana' }, { promoteValues: false }).toArray();
    expect(ana._id.toHexString()).toBe('64b7f0000000000000000001');
    expect(ana.n).toBeInstanceOf(BSON.Long);
    expect(ana.i).toBeInstanceOf(BSON.Int32);
    expect(ana.f).toBeInstanceOf(BSON.Double);
    expect(ana.d).toBeInstanceOf(BSON.Decimal128);
    expect([...ana.bin.buffer]).toEqual([1, 2, 3]);
    expect((await db.collection('users').indexes()).find(({ name }) => name === 'name_1')).toMatchObject({
      unique: true,
    });
    expect((await db.listCollections({ name: 'empty' }).toArray()).length).toBe(1);
    await expect(db.collection('users').insertOne({ name: 'ana' })).rejects.toThrow(/duplicate key/);
  });

  it('restores only the databases the target names', async () => {
    const { restored, skipped } = await restoreMongoArchive({ client, source: gzip(), target: () => null });
    expect(restored).toEqual({});
    expect(skipped.sort()).toEqual(Object.keys(RECORDED).sort());
  });
});
