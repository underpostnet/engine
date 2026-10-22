import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import nodePath from 'path';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import Underpost from '../../../src/index.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// Needs `mongod`: `UNDERPOST_MONGOD_BIN`, or one on PATH.
const { BSON } = mongoose.mongo;

/** A `mongodump` database directory: one file of concatenated BSON documents per collection. */
const writeDump = async (dir, collections) => {
  await fs.ensureDir(dir);
  await fs.writeJson(nodePath.join(dir, 'prelude.json'), { ServerVersion: '8.0.0' });
  for (const [name, documents] of Object.entries(collections)) {
    await fs.writeFile(nodePath.join(dir, `${name}.bson`), Buffer.concat(documents.map((doc) => BSON.serialize(doc))));
    await fs.writeJson(nodePath.join(dir, `${name}.metadata.json`), { indexes: [] });
  }
};

describe.skipIf(!mongodBinary)('a MongoDB dump read through the driver', () => {
  let mongod;
  let client;
  let scratch;

  beforeAll(async () => {
    mongod = await startMongod('dump');
    client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
    scratch = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'mongo-dump-'));
  }, 60000);

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
    await fs.remove(scratch);
  });

  it('restores every collection with its BSON types and identifiers', async () => {
    const things = [
      {
        _id: new BSON.ObjectId(),
        name: 'forest',
        count: new BSON.Int32(5),
        ratio: new BSON.Double(2),
        big: BSON.Long.fromNumber(2 ** 40),
        data: new BSON.Binary(Buffer.from('frame')),
        at: new Date(0),
        tags: ['a', new BSON.Int32(1)],
        nested: { owner: new BSON.ObjectId(), flag: true },
      },
      { _id: new BSON.ObjectId(), name: 'cave' },
    ];
    const dir = nodePath.join(scratch, 'source');
    await writeDump(dir, { things, empty: [] });

    const db = client.db('restored');
    expect(await Underpost.db.restoreDump(db, dir)).toEqual({ things: 2, empty: 0 });
    const stored = await db.collection('things').find({}, { promoteValues: false }).sort({ name: -1 }).toArray();
    expect(stored.map((doc) => BSON.serialize(doc))).toEqual(things.map((doc) => BSON.serialize(doc)));
  });

  it('reads one collection, and nothing for a collection the dump does not hold', async () => {
    const dir = nodePath.join(scratch, 'ledger');
    await writeDump(dir, { releases: [{ releaseId: 'r1', status: 'active', database: 'content-r1' }] });

    expect(Underpost.db.readDumpCollection(dir, 'releases')).toEqual([
      { releaseId: 'r1', status: 'active', database: 'content-r1' },
    ]);
    expect(Underpost.db.readDumpCollection(dir, 'missing')).toEqual([]);
  });
});
