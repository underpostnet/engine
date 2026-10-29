import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import Underpost from '../../../src/index.js';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { shellSpawn } from '../../../src/server/runtime/process.js';
import { objectStore } from '../../../src/server/storage/object-store.js';
import { listBackups } from '../../../src/server/storage/backup.js';
import { CONTENT_PARTITION } from '../../../src/projects/cyberia/content/content-release.js';
import {
  BASELINE_PROFILE,
  assertDevelopmentTarget,
  baselineFileIds,
  baselineOwnedCids,
  captureContentBaseline,
  downloadContentBaseline,
  referencedFileIds,
  restoreContentBaseline,
} from '../../../src/projects/cyberia/content/content-baseline.js';
import { findBinary } from '../../support/binary.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// Needs `mongod` (`UNDERPOST_MONGOD_BIN`) and `mongodump` (`UNDERPOST_MONGODUMP_BIN`, or on PATH).
// The client pod is this process: the dump runs the real tool against the source replica set.
const mongodumpBinary = findBinary('mongodump', 'UNDERPOST_MONGODUMP_BIN');
const { ObjectId } = mongoose.Types;
const CONTENT_APIS = ['cyberia-map', 'cyberia-instance', 'cyberia-audio', 'atlas-sprite-sheet', 'object-layer'];
const RUNTIME_APIS = ['cyberia-content-release', 'file', 'cyberia-player'];
const host = { host: 'cyberia.test', path: '/' };
const RELEASE = 'r9';
const RELEASE_DB = `cyberia-content-${RELEASE}`;
const OWNED = 'bafkreih4bm2vkdewvuqbmt6ncdhfipiw2dwkpwmujwthb2pwh5gkhfmpkm';

describe.skipIf(!mongodBinary || !mongodumpBinary)('a production content baseline', () => {
  let source;
  let target;
  let client;
  let targetClient;
  let scratch;
  let store;
  let context;
  const ids = { atlas: new ObjectId(), thumbnail: new ObjectId(), unrelated: new ObjectId() };

  beforeAll(async () => {
    scratch = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'content-baseline-'));
    store = objectStore(`file:${scratch}/store`);
    process.env.UNDERPOST_BACKUP_KEY = crypto.randomBytes(32).toString('hex');
    process.env.UNDERPOST_BASELINE_CACHE = `${scratch}/cache`;
    source = await startMongod('cyberia-runtime', { replSet: 'rs0' });
    target = await startMongod('local');
    client = await new mongoose.mongo.MongoClient(source.uri).connect();
    targetClient = await new mongoose.mongo.MongoClient(target.uri).connect();
    await DataBaseProviderService.load({
      apis: [...RUNTIME_APIS, ...CONTENT_APIS],
      ...host,
      db: {
        provider: 'mongoose',
        host: source.host,
        replicaSet: 'rs0',
        name: 'cyberia-runtime',
        partitions: { [CONTENT_PARTITION]: { name: RELEASE_DB, apis: CONTENT_APIS } },
      },
    });
    const runtime = client.db('cyberia-runtime');
    await runtime.collection('files').insertMany([
      { _id: ids.atlas, name: 'atlas.png', data: Buffer.from('atlas'), mimetype: 'image/png' },
      { _id: ids.thumbnail, name: 'thumb.png', data: Buffer.from('thumb'), mimetype: 'image/png' },
      { _id: ids.unrelated, name: 'avatar.png', data: Buffer.from('private'), mimetype: 'image/png' },
    ]);
    await runtime
      .collection('cyberiaplayers')
      .insertOne({ bag: [{ olCid: OWNED, quantity: 1 }], email: 'kept@private' });
    const release = client.db(RELEASE_DB);
    await release.collection('atlasspritesheets').insertOne({ objectLayerCid: 'x', fileId: ids.atlas });
    await release.collection('cyberiainstances').insertOne({ code: 'a', thumbnail: ids.thumbnail });
    await release.collection('cyberiamaps').insertOne({ code: 'm' });
    const Release = DataBaseProviderService.getModel('CyberiaContentRelease', host);
    await Release.collection.insertOne({
      releaseId: RELEASE,
      database: RELEASE_DB,
      status: 'active',
      source: { from: 'source', channel: 'private', repository: 'acme/content', sourceRevision: 'a'.repeat(40) },
      content: { version: '1.0.0', digest: `sha256:${'1'.repeat(64)}` },
      lease: { executing: true },
      promotedAt: new Date(),
    });
    context = {
      ...host,
      models: DataBaseProviderService.getProvider(host).models,
      connection: DataBaseProviderService.getConnection(host),
    };

    // The client pod is this process; the tools read the source replica set directly.
    const tools = nodePath.dirname(mongodumpBinary);
    Underpost.db.openMongoClient = async () => ({
      pod: { name: 'local', namespace: 'default', remove() {} },
      hosts: [source.host],
      image: 'local',
      principal: () => null,
    });
    Underpost.kubectl.execStream = ({ command }) =>
      shellSpawn(command, { disableLog: true, env: { ...process.env, PATH: `${tools}:${process.env.PATH}` } });
    Underpost.db.mongoReplicaSetId = () => '';
    Underpost.db.mongoDbHash = ({ database }) => database;
    const rs = await client.db('admin').command({ replSetGetConfig: 1 });
    Underpost.db.mongoReplicaSetId = () => rs.config.settings.replicaSetId.toHexString();
  }, 120000);

  afterAll(async () => {
    await DataBaseProviderService.getProvider(host)?.close();
    await client?.close();
    await targetClient?.close();
    await source?.stop();
    await target?.stop();
    await fs.remove(scratch);
  });

  const capture = (extra = {}) =>
    captureContentBaseline({
      deployId: 'dd-test',
      namespace: 'default',
      context,
      entry: { user: '', password: '' },
      apis: CONTENT_APIS,
      store,
      ...extra,
    });

  it('reads only the Files the release content references', async () => {
    const found = await referencedFileIds({ connection: context.connection, database: RELEASE_DB, apis: CONTENT_APIS });
    expect(found.map(String).sort()).toEqual([ids.atlas, ids.thumbnail].map(String).sort());
  });

  it('captures the active release, its referenced Files and the CIDs players own, with a consistency proof', async () => {
    const manifest = await capture();
    expect(manifest.profile).toBe(BASELINE_PROFILE);
    expect(manifest.meta).toMatchObject({
      schema: 1,
      release: { releaseId: RELEASE, database: RELEASE_DB, source: { sourceRevision: 'a'.repeat(40) } },
      scope: { database: RELEASE_DB, files: 2, owned: 1 },
      consistency: { pointInTime: true, mechanism: 'dbHash', before: RELEASE_DB, after: RELEASE_DB },
    });
    const releaseStream = manifest.streams.find(({ name }) => name === 'release-db');
    const held = (await client.db(RELEASE_DB).listCollections().toArray()).map(({ name }) => `${RELEASE_DB}.${name}`);
    expect(Object.keys(releaseStream.inventory.namespaces).sort()).toEqual(held.sort());
    expect(releaseStream.inventory.namespaces[`${RELEASE_DB}.cyberiainstances`].documents).toBe(1);
    expect(manifest.source.mongodb.replicaSetId).toMatch(/^[0-9a-f]{24}$/);
  });

  it('captures again when content changes in the window, and records the attempt that saw it', async () => {
    let calls = 0;
    Underpost.db.mongoDbHash = () => (++calls === 2 ? 'changed' : 'stable');
    try {
      const manifest = await capture({ attempts: 2 });
      expect(manifest.meta.consistency).toMatchObject({ before: 'stable', after: 'stable' });
    } finally {
      Underpost.db.mongoDbHash = ({ database }) => database;
    }
    const statuses = (await listBackups({ store, deployId: 'dd-test', profile: BASELINE_PROFILE })).map(
      ({ status }) => status,
    );
    expect(statuses).toContain('failed');
  });

  it('refuses a restore into the replica set it was captured from, and restores into a development server', async () => {
    const [newest] = (await listBackups({ store, deployId: 'dd-test', profile: BASELINE_PROFILE })).filter(
      ({ status }) => status === 'available',
    );
    const baseline = await downloadContentBaseline({ store, deployId: 'dd-test', backupId: newest.backupId });
    expect(baseline.downloaded).toBe(true);
    expect((await downloadContentBaseline({ store, deployId: 'dd-test', backupId: newest.backupId })).downloaded).toBe(
      false,
    );
    expect(baselineOwnedCids(baseline)).toEqual([OWNED]);
    expect((await baselineFileIds(baseline)).map(String).sort()).toEqual([ids.atlas, ids.thumbnail].map(String).sort());

    await expect(assertDevelopmentTarget({ client, manifest: baseline.manifest })).rejects.toThrow(/Refused/);
    expect(await assertDevelopmentTarget({ client: targetClient, manifest: baseline.manifest })).toBe('');

    const local = `cyberia-content-dev-${RELEASE}`;
    await expect(
      restoreContentBaseline({
        client: targetClient,
        baseline,
        runtimeDatabase: 'local-runtime',
        releaseDatabase: 'cyberia-runtime',
      }),
    ).rejects.toThrow(/is not the database of release/);
    const result = await restoreContentBaseline({
      client: targetClient,
      baseline,
      runtimeDatabase: 'local-runtime',
      releaseDatabase: local,
    });
    expect(result).toMatchObject({ files: 2, ledger: true });
    expect(await targetClient.db(local).collection('cyberiainstances').countDocuments()).toBe(1);
    const files = await targetClient.db('local-runtime').collection('files').find().toArray();
    expect(files.map(({ name }) => name).sort()).toEqual(['atlas.png', 'thumb.png']);
    expect(await targetClient.db('local-runtime').collection('cyberiaplayers').countDocuments()).toBe(0);
    expect(
      await targetClient.db('local-runtime').collection('cyberiacontentreleases').findOne({ releaseId: RELEASE }),
    ).toMatchObject({
      status: 'validated',
      database: local,
    });
  });
});
