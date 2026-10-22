import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { startMongod, mongodBinary } from '../../support/mongod.js';
import {
  catalogRegistryModels,
  reconcileMapRegistry,
  registryTransaction,
  resolveMapOwner,
} from '../../../src/projects/cyberia/instance/map-registry.js';

// A replica set gives the transactions every catalog write runs in.
describe.skipIf(!mongodBinary)('the map registry of a catalog', () => {
  let db, connection, models;
  const rowOf = (mapCode, Registry = models.CyberiaGlobalMapCodeRegistry) =>
    Registry.findOne({ catalog: 'catalog-a', mapCode }).lean();

  beforeAll(async () => {
    db = await startMongod('map-registry', { replSet: 'map-registry' });
    connection = await mongoose.createConnection(db.uri).asPromise();
    models = await catalogRegistryModels(connection, 'catalog-a');
    for (const model of Object.values(models)) await model.init();
  });
  afterAll(async () => {
    await connection?.close();
    await db?.stop();
  });

  it('registers what a catalog write lists, in its transaction, and a no-op writes nothing', async () => {
    await registryTransaction(models, (session) =>
      models.CyberiaMap.create([{ code: 'gate', status: 'published' }, { code: 'cave' }], { session, ordered: true }),
    );
    expect(await models.CyberiaGlobalMapCodeRegistry.countDocuments()).toBe(0);
    const { report } = await registryTransaction(models, (session) =>
      models.CyberiaInstance.create([{ code: 'world-a', status: 'published', cyberiaMapCodes: ['gate', 'cave'] }], {
        session,
      }),
    );
    expect(report.changes.map(({ kind, mapCode, status }) => [kind, mapCode, status])).toEqual([
      ['registered', 'cave', 'unlisted'],
      ['registered', 'gate', 'active'],
    ]);
    const first = await rowOf('gate');
    expect(first.version).toBe(1);
    expect((await registryTransaction(models)).report.changes).toEqual([]);
    const second = await rowOf('gate');
    expect([second.version, second.updatedAt]).toEqual([first.version, first.updatedAt]);
    expect(await resolveMapOwner(models, 'gate')).toMatchObject({
      instanceCode: 'world-a',
      status: 'active',
      version: 1,
    });
    expect(await resolveMapOwner(models, 'cave')).toMatchObject({ instanceCode: 'world-a', status: 'unlisted' });
  });

  it('refuses a write that adds a defect, and keeps nothing of it', async () => {
    await expect(
      registryTransaction(models, (session) =>
        models.CyberiaInstance.create([{ code: 'rival', cyberiaMapCodes: ['gate'] }], { session }),
      ),
    ).rejects.toThrow('Map gate has conflicting owners: world-a, rival');
    expect(await models.CyberiaInstance.exists({ code: 'rival' })).toBeNull();
    await expect(
      registryTransaction(models, (session) =>
        models.CyberiaMap.create([{ code: 'peak', worldX: 0, worldY: 0 }], { session }),
      ),
    ).resolves.toBeDefined();
    await expect(
      registryTransaction(models, (session) =>
        models.CyberiaMap.create([{ code: 'ridge', worldX: 8, worldY: 0 }], { session }).then(() =>
          models.CyberiaInstance.updateOne(
            { code: 'world-a' },
            { $push: { cyberiaMapCodes: { $each: ['peak', 'ridge'] } } },
            { session },
          ),
        ),
      ),
    ).rejects.toThrow('Maps peak and ridge overlap in their world');
    expect(await models.CyberiaMap.exists({ code: 'ridge' })).toBeNull();
  });

  it('lets a write past a defect it found, which the report still names, and keeps the stored owner', async () => {
    await models.CyberiaInstance.collection.insertOne({ code: 'squatter', cyberiaMapCodes: ['gate', 'ghost'] });
    const { report } = await registryTransaction(models, (session) =>
      models.CyberiaMap.create([{ code: 'shore' }], { session }),
    );
    expect(report.defects).toEqual([
      'Map gate has conflicting owners: world-a, squatter',
      'Instance squatter lists missing map ghost',
    ]);
    expect(report.changes).toEqual([]);
    expect(await resolveMapOwner(models, 'gate')).toMatchObject({ instanceCode: 'world-a' });
    await models.CyberiaInstance.deleteOne({ code: 'squatter' });
  });

  it('moves a code through its statuses, one version per change, and keeps a retired owner', async () => {
    await registryTransaction(models, (session) =>
      models.CyberiaMap.updateOne({ code: 'gate' }, { status: 'archived' }, { session }),
    );
    expect(await resolveMapOwner(models, 'gate')).toBeNull();
    expect(await rowOf('gate')).toMatchObject({ status: 'deprecated', version: 2 });
    await registryTransaction(models, (session) =>
      models.CyberiaInstance.updateOne({ code: 'world-a' }, { cyberiaMapCodes: ['cave'] }, { session }),
    );
    const retired = await rowOf('gate');
    expect(retired).toMatchObject({ status: 'deprecated', instanceCode: 'world-a', version: 2 });
    const { report } = await registryTransaction(models, async (session) => {
      await models.CyberiaMap.updateOne({ code: 'gate' }, { status: 'published' }, { session });
      await models.CyberiaInstance.create([{ code: 'world-b', status: 'published', cyberiaMapCodes: ['gate'] }], {
        session,
      });
    });
    expect(report.changes).toEqual([
      { kind: 'reassigned', mapCode: 'gate', instanceCode: 'world-b', status: 'active', from: 'world-a' },
    ]);
    expect(await rowOf('gate')).toMatchObject({ status: 'active', instanceCode: 'world-b', version: 3 });
  });

  it('repairs a row its checksum refutes, and refuses to resolve it until then', async () => {
    await models.CyberiaGlobalMapCodeRegistry.updateOne(
      { catalog: 'catalog-a', mapCode: 'cave' },
      { instanceCode: 'forged' },
    );
    await expect(resolveMapOwner(models, 'cave')).rejects.toThrow('fails its checksum');
    expect((await reconcileMapRegistry(models)).changes).toEqual([
      { kind: 'repaired', mapCode: 'cave', instanceCode: 'world-a', status: 'unlisted' },
    ]);
    await registryTransaction(models);
    expect(await resolveMapOwner(models, 'cave')).toMatchObject({ instanceCode: 'world-a' });
  });

  it('keeps each catalog apart and converges when reconciliations run at once', async () => {
    const staged = await catalogRegistryModels(connection, 'catalog-staged');
    for (const model of Object.values(staged)) await model.init();
    await staged.CyberiaMap.create({ code: 'gate', status: 'published' });
    await staged.CyberiaInstance.create({ code: 'world-c', status: 'published', cyberiaMapCodes: ['gate'] });
    await Promise.all([registryTransaction(staged), registryTransaction(staged), registryTransaction(staged)]);
    expect((await resolveMapOwner(staged, 'gate')).instanceCode).toBe('world-c');
    expect((await resolveMapOwner(models, 'gate')).instanceCode).toBe('world-b');
    expect((await reconcileMapRegistry(staged)).changes).toEqual([]);
    expect(await staged.CyberiaGlobalMapCodeRegistry.countDocuments({ catalog: 'catalog-staged' })).toBe(1);
  });
});
