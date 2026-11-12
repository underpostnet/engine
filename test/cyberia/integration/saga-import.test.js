import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
import { contentArtifact, hasContentArtifact } from '../../../src/projects/cyberia/content/content-artifact.js';
import { importSaga } from '../../../src/projects/cyberia/saga/saga-import.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// The import of a saga into a workspace on a real replica set: the saga record, the world it joins,
// that world's conf and the map registry. Each case reads the stored documents, never only the report.
const options = { host: 'saga-import-test', path: '/' };
const model = (name) => DataBaseProviderService.getModel(name, options);
const models = () => DataBaseProviderService.getProvider(options, 'mongoose').models;

const entityDefault = (skin) => ({
  entityType: 'bot',
  liveItemIds: [skin],
  deadItemIds: [],
  dropItemIds: [],
  inventoryItemsIds: [],
  overrideItemsIdsState: [],
  behavior: 'provider',
});

/** A compiled saga as cyberia-content builds it, with no Object Layer item, so nothing reaches IPFS. */
const compiledSaga = (code, mapCodes, { skins = [`${code}-keeper`], title = 'Errand', placeCodes = [] } = {}) => ({
  saga: {
    code,
    name: `Saga ${code}`,
    description: `The ${code} saga.`,
    foundationVersion: '3.0.0',
    references: [],
    definitions: [{ id: `quest.${code}-errand`, name: title }],
    mapCodes,
    placeCodes,
    itemIds: [...skins, 'shared-relic'],
    questCodes: [{ providerSkinItemId: skins[0], questCode: `${code}-errand`, mapCode: mapCodes[0] ?? '' }],
    actionCodes: [],
  },
  instance: {
    code,
    name: `Saga ${code}`,
    description: `The ${code} saga.`,
    tags: ['saga', 'generated'],
    cyberiaMapCodes: mapCodes,
    portals: [],
    topologyMode: 'procedural',
  },
  families: {
    objectLayers: [],
    entityTypeDefaults: skins.map(entityDefault),
    skills: [],
    maps: mapCodes.map((mapCode) => ({ code: mapCode, name: mapCode, description: `Map ${mapCode}.`, tags: [] })),
    quests: [
      {
        code: `${code}-errand`,
        title,
        description: 'Bring a relic.',
        prerequisiteCodes: [],
        unlocksQuestCodes: [],
        sourceMapCode: null,
        sourceCellX: null,
        sourceCellY: null,
        steps: [
          {
            id: 'bring',
            description: 'Bring it.',
            objectives: [{ type: 'collect', itemId: 'shared-relic', quantity: 1 }],
          },
        ],
        rewards: [],
      },
    ],
    dialogues: [],
    markets: [],
    actions: [],
    economies: [],
  },
});

const FRONTIER = compiledSaga('frontier', ['outpost', 'ridge']);
const run = (saga, params = {}) => importSaga({ saga, models: models(), context: options, ...params });
const world = (code) => model('CyberiaInstance').findOne({ code }).lean();
const confOf = (code) => model('CyberiaInstanceConf').findOne({ instanceCode: code }).lean();
const registry = async () =>
  (
    await model('CyberiaGlobalMapCodeRegistry').find({}, { mapCode: 1, instanceCode: 1 }).sort({ mapCode: 1 }).lean()
  ).map(({ mapCode, instanceCode }) => `${mapCode}:${instanceCode}`);
/** A stored world as Instance Studio leaves it, with its conf. */
const storeWorld = async (code, fields = {}, confFields = {}) => {
  const conf = await model('CyberiaInstanceConf').create({ instanceCode: code, ...confFields });
  return await model('CyberiaInstance').create({ code, name: code, conf: conf._id, ...fields });
};
const storeMap = (code, fields = {}) => model('CyberiaMap').create({ code, name: code, ...fields });

describe.skipIf(!mongodBinary)('saga import into a workspace', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('cyberia-saga-import', { replSet: 'importset' });
    await DataBaseProviderService.load({
      apis: [
        'cyberia-saga',
        'cyberia-instance',
        'cyberia-instance-conf',
        'cyberia-map',
        'cyberia-quest',
        'cyberia-action',
        'cyberia-dialogue',
        'cyberia-skill',
        'cyberia-market',
        'cyberia-entity-type-default',
        'cyberia-economy',
        'cyberia-economic-item-policy',
        'cyberia-global-map-code-registry',
      ],
      ...options,
      db: { provider: 'mongoose', host: mongod.host, name: 'cyberia-saga-import', replicaSet: 'importset' },
    });
    // The unique indexes are part of what a concurrent import relies on.
    for (const name of ['CyberiaSaga', 'CyberiaInstance', 'CyberiaInstanceConf', 'CyberiaMap', 'CyberiaQuest'])
      await model(name).init();
  }, 60000);

  afterAll(async () => {
    await DataBaseProviderService.getProvider(options, 'mongoose')
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${options.host}${options.path}`];
    await mongod?.stop();
  });

  beforeEach(async () => {
    for (const name of Object.keys(models())) await models()[name].deleteMany({});
  });

  it('creates the saga record, its authoring world and a linked conf in an empty workspace', async () => {
    const { report } = await run(FRONTIER);
    expect(report).toMatchObject({
      saga: { code: 'frontier', status: 'inserted', fields: [] },
      targetInstance: { code: 'frontier', created: true, confLinked: false },
      instanceConf: { created: true, defaultsAdded: 1, defaultsPresent: 0 },
      maps: { attached: ['outpost', 'ridge'], alreadyAttached: [], ownedElsewhere: [] },
      families: { maps: { inserted: 2 }, quests: { inserted: 1 } },
      conflicts: [],
      registry: { defects: [] },
    });
    const stored = await world('frontier');
    const conf = await confOf('frontier');
    expect(stored).toMatchObject({ name: 'Saga frontier', topologyMode: 'procedural', revision: 1 });
    expect(stored.cyberiaMapCodes).toEqual(['outpost', 'ridge']);
    expect(String(stored.conf)).toBe(String(conf._id));
    expect(conf.entityDefaults).toHaveLength(1);
    expect(conf.economyCode).toBe('standard');
    expect(await model('CyberiaSaga').countDocuments()).toBe(1);
    expect(await registry()).toEqual(['outpost:frontier', 'ridge:frontier']);
  });

  it('creates the authoring world beside other worlds and leaves them as they are', async () => {
    await storeMap('camp');
    await storeWorld('test', { cyberiaMapCodes: ['camp'], status: 'published' });
    await storeWorld('fallback');
    const before = await model('CyberiaInstance')
      .find({ code: { $in: ['test', 'fallback'] } })
      .sort({ code: 1 })
      .lean();
    const { report } = await run(FRONTIER);
    expect(report.targetInstance).toEqual({ code: 'frontier', created: true, confLinked: false });
    expect(
      await model('CyberiaInstance')
        .find({ code: { $in: ['test', 'fallback'] } })
        .sort({ code: 1 })
        .lean(),
    ).toEqual(before);
    expect(await model('CyberiaInstance').countDocuments()).toBe(3);
    expect(await registry()).toEqual(['camp:test', 'outpost:frontier', 'ridge:frontier']);
  });

  it('keeps every setting of an authoring world that exists, adds the missing maps and moves its revision', async () => {
    await storeMap('lagoon');
    await storeWorld(
      'frontier',
      {
        name: 'Shared frontier',
        status: 'published',
        cyberiaMapCodes: ['lagoon', 'outpost'],
        portals: [
          {
            sourceMapCode: 'lagoon',
            sourceCellX: 1,
            sourceCellY: 2,
            targetMapCode: 'outpost',
            targetCellX: 3,
            targetCellY: 4,
          },
        ],
        playerSpawn: { sourceMapCode: 'lagoon', sourceCellX: 5, sourceCellY: 6 },
        revision: 7,
      },
      { economyCode: 'frontier-economy', entityDefaults: [] },
    );
    await storeMap('outpost', { description: 'Placed in Studio.' });
    const { report } = await run(FRONTIER);
    expect(report.targetInstance).toEqual({ code: 'frontier', created: false, confLinked: false });
    expect(report.maps).toEqual({ attached: ['ridge'], alreadyAttached: ['outpost'], ownedElsewhere: [] });
    const stored = await world('frontier');
    expect(stored).toMatchObject({ name: 'Shared frontier', status: 'published', revision: 8 });
    expect(stored.cyberiaMapCodes).toEqual(['lagoon', 'outpost', 'ridge']);
    expect(stored.portals).toHaveLength(1);
    expect(stored.playerSpawn).toMatchObject({ sourceMapCode: 'lagoon', sourceCellX: 5, sourceCellY: 6 });
    expect((await confOf('frontier')).economyCode).toBe('frontier-economy');
    expect((await model('CyberiaMap').findOne({ code: 'outpost' }).lean()).description).toBe('Placed in Studio.');
  });

  it('creates and links the conf of a world that has none', async () => {
    await model('CyberiaInstance').create({ code: 'frontier', name: 'No conf' });
    const { report } = await run(FRONTIER);
    expect(report.targetInstance).toMatchObject({ created: false, confLinked: true });
    expect(report.instanceConf).toMatchObject({ created: true, defaultsAdded: 1 });
    const stored = await world('frontier');
    expect(String(stored.conf)).toBe(String((await confOf('frontier'))._id));
    expect(stored.name).toBe('No conf');
  });

  it('adds only the default references a conf misses', async () => {
    const other = await model('CyberiaEntityTypeDefault').create(entityDefault('studio-guard'));
    await storeWorld('frontier', {}, { entityDefaults: [other._id], economyCode: 'kept' });
    const saga = compiledSaga('frontier', ['outpost'], { skins: ['frontier-keeper', 'frontier-smith'] });
    await run(compiledSaga('frontier', ['outpost'], { skins: ['frontier-keeper'] }));
    const { report } = await run(saga);
    expect(report.instanceConf).toEqual({ created: false, defaultsAdded: 1, defaultsPresent: 1 });
    const conf = await confOf('frontier');
    expect(conf.entityDefaults).toHaveLength(3);
    expect(conf.entityDefaults.map(String)).toContain(String(other._id));
    expect(conf.economyCode).toBe('kept');
  });

  it('keeps a map another world owns there, and names that world', async () => {
    await storeMap('outpost');
    await storeWorld('caravan', { cyberiaMapCodes: ['outpost'] });
    const { report } = await run(FRONTIER);
    expect(report.maps).toEqual({
      attached: ['ridge'],
      alreadyAttached: [],
      ownedElsewhere: [{ mapCode: 'outpost', instanceCode: 'caravan' }],
    });
    expect((await world('frontier')).cyberiaMapCodes).toEqual(['ridge']);
    expect((await world('caravan')).cyberiaMapCodes).toEqual(['outpost']);
    expect(report.registry.defects).toEqual([]);
  });

  it('lets two sagas share a map and an item without a second copy or a second owner', async () => {
    await run(FRONTIER);
    const caravan = compiledSaga('caravan', ['outpost', 'dunes']);
    const { report } = await run(caravan);
    expect(report.families.maps).toMatchObject({ inserted: 1, inSync: 1 });
    expect(report.maps.ownedElsewhere).toEqual([{ mapCode: 'outpost', instanceCode: 'frontier' }]);
    expect(await model('CyberiaMap').countDocuments({ code: 'outpost' })).toBe(1);
    expect(await registry()).toEqual(['dunes:caravan', 'outpost:frontier', 'ridge:frontier']);
    const sagas = await model('CyberiaSaga').find({}, { code: 1, itemIds: 1 }).sort({ code: 1 }).lean();
    expect(sagas.map(({ itemIds }) => itemIds.includes('shared-relic'))).toEqual([true, true]);
  });

  it('changes nothing the second time and reports every record in sync', async () => {
    await run(FRONTIER);
    const before = await world('frontier');
    const { report } = await run(FRONTIER);
    expect(report).toMatchObject({
      saga: { status: 'in-sync' },
      targetInstance: { created: false, confLinked: false },
      instanceConf: { created: false, defaultsAdded: 0, defaultsPresent: 1 },
      maps: { attached: [], alreadyAttached: ['outpost', 'ridge'] },
      families: { maps: { inSync: 2, inserted: 0 }, quests: { inSync: 1 } },
      registry: { changes: [] },
    });
    expect(await world('frontier')).toEqual(before);
  });

  it('runs two imports of one saga at once into one world, once', async () => {
    const reports = (await Promise.all([run(FRONTIER), run(FRONTIER)])).map(({ report }) => report);
    expect(reports.map(({ targetInstance }) => targetInstance.created).sort()).toEqual([false, true]);
    expect(await model('CyberiaInstance').countDocuments({ code: 'frontier' })).toBe(1);
    expect(await model('CyberiaInstanceConf').countDocuments({ instanceCode: 'frontier' })).toBe(1);
    expect(await model('CyberiaSaga').countDocuments({ code: 'frontier' })).toBe(1);
    expect(await model('CyberiaMap').countDocuments()).toBe(2);
    expect(await model('CyberiaEntityTypeDefault').countDocuments()).toBe(1);
    expect((await world('frontier')).cyberiaMapCodes).toEqual(['outpost', 'ridge']);
    expect((await confOf('frontier')).entityDefaults).toHaveLength(1);
    expect(await registry()).toEqual(['outpost:frontier', 'ridge:frontier']);
  });

  it('adds the saga to a named world and creates no authoring world', async () => {
    await storeMap('camp');
    await storeWorld('cyberia-main', { cyberiaMapCodes: ['camp'] });
    const { report } = await run(FRONTIER, { instanceCode: 'cyberia-main' });
    expect(report.targetInstance).toEqual({ code: 'cyberia-main', created: false, confLinked: false });
    expect((await world('cyberia-main')).cyberiaMapCodes).toEqual(['camp', 'outpost', 'ridge']);
    expect(await world('frontier')).toBeNull();
  });

  it('refuses a named world that does not exist and writes nothing, unless asked to create it', async () => {
    await expect(run(FRONTIER, { instanceCode: 'cyberia-mian' })).rejects.toMatchObject({ status: 404 });
    for (const name of ['CyberiaSaga', 'CyberiaInstance', 'CyberiaMap', 'CyberiaQuest'])
      expect(await model(name).countDocuments(), name).toBe(0);
    const { report } = await run(FRONTIER, { instanceCode: 'cyberia-main', createInstance: true });
    expect(report.targetInstance).toEqual({ code: 'cyberia-main', created: true, confLinked: false });
    expect(await world('cyberia-main')).toMatchObject({ name: 'cyberia-main', cyberiaMapCodes: ['outpost', 'ridge'] });
  });

  it('keeps a saga record and a quest that differ, names the fields, and moves them with rebind', async () => {
    await run(FRONTIER);
    const edited = compiledSaga('frontier', ['outpost', 'ridge'], { title: 'Edited errand' });
    edited.saga.description = 'A new premise.';
    const { report } = await run(edited);
    expect(report.saga).toEqual({ code: 'frontier', status: 'differs-kept', fields: ['description', 'definitions'] });
    expect(report.families.quests).toMatchObject({ differsKept: 1 });
    expect((await model('CyberiaSaga').findOne({ code: 'frontier' }).lean()).description).toBe('The frontier saga.');
    const rebound = await run(edited, { rebind: true });
    expect(rebound.report.saga.status).toBe('rebound');
    expect(rebound.report.families.quests).toMatchObject({ rebound: 1 });
    expect((await model('CyberiaSaga').findOne({ code: 'frontier' }).lean()).description).toBe('A new premise.');
    expect(await model('CyberiaQuest').findOne({ code: 'frontier-errand' }).lean()).toMatchObject({
      title: 'Edited errand',
      revision: 2,
    });
  });

  it('writes no document when the world write is refused, and completes on a rerun', async () => {
    await storeMap('camp', { worldX: 0, worldY: 0, gridX: 16, gridY: 16 });
    await storeMap('outpost', { worldX: 4, worldY: 4, gridX: 16, gridY: 16 });
    await storeWorld('frontier', { cyberiaMapCodes: ['camp'] });
    const error = await run(FRONTIER).catch((caught) => caught);
    expect(error).toMatchObject({ status: 409, message: expect.stringMatching(/overlap/) });
    expect(error.report.families).toEqual({
      objectLayers: { inserted: 0, inSync: 0, differsKept: 0, rebound: 0, conflict: 0 },
    });
    expect(await model('CyberiaSaga').countDocuments()).toBe(0);
    expect(await model('CyberiaMap').countDocuments({ code: 'ridge' })).toBe(0);
    expect(await confOf('frontier')).toMatchObject({ entityDefaults: [] });
    expect((await world('frontier')).cyberiaMapCodes).toEqual(['camp']);

    await model('CyberiaMap').updateOne({ code: 'camp' }, { $set: { worldX: 40 } });
    const { report } = await run(FRONTIER);
    expect(report).toMatchObject({ saga: { status: 'inserted' }, maps: { attached: ['outpost', 'ridge'] } });
    expect((await world('frontier')).cyberiaMapCodes).toEqual(['camp', 'outpost', 'ridge']);
  });

  it('names the places of a saga and attaches them to no world', async () => {
    await run(FRONTIER);
    const pilgrims = compiledSaga('pilgrims', ['shrine'], { placeCodes: ['outpost'] });
    const { report } = await run(pilgrims);
    expect(report.places).toEqual(['outpost']);
    expect((await world('pilgrims')).cyberiaMapCodes).toEqual(['shrine']);
    expect((await world('frontier')).cyberiaMapCodes).toEqual(['outpost', 'ridge']);
    expect((await model('CyberiaSaga').findOne({ code: 'pilgrims' }).lean()).placeCodes).toEqual(['outpost']);
  });

  it('plans a dry run with the same report and writes nothing', async () => {
    await storeWorld('test');
    const { report } = await run(FRONTIER, { dryRun: true });
    expect(report).toMatchObject({
      saga: { status: 'inserted' },
      targetInstance: { code: 'frontier', created: true },
      instanceConf: { created: true, defaultsAdded: 1 },
      maps: { attached: ['outpost', 'ridge'] },
      families: { maps: { inserted: 2 } },
    });
    expect(await model('CyberiaInstance').countDocuments()).toBe(1);
    expect(await model('CyberiaMap').countDocuments()).toBe(0);
  });
});

// The real CLI against a workspace that already holds other worlds: the foundation, two instance
// snapshots, then the saga of the built artifact. Each step reads the JSON report and the database.
describe.skipIf(!mongodBinary || !hasContentArtifact())('content import --saga through the CLI', () => {
  const cli = new URL('../../../bin/cyberia.js', import.meta.url).pathname;
  const APIS = ['cyberia-instance', 'cyberia-instance-conf', 'cyberia-map', 'cyberia-saga'];
  let mongod;
  let pod;
  let client;
  let sagaCode;

  /** Runs the CLI as a pod does; the run is asynchronous, so this process keeps reading the mongod it started. */
  const run = (...args) =>
    new Promise((resolve) => {
      const env = {
        ...process.env,
        DEFAULT_DEPLOY_ID: 'dd-x',
        DEFAULT_DEPLOY_HOST: 'h',
        DEFAULT_DEPLOY_PATH: '/',
        IPFS_API_URL: 'http://127.0.0.1:9',
        IPFS_CLUSTER_API_URL: 'http://127.0.0.1:9',
        npm_config_prefix: `${pod}/npm-global`,
      };
      for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete env[key];
      const child = spawn(process.execPath, [cli, ...args, '--mongo-host', mongod.host], { cwd: pod, env });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('close', (status) => resolve({ status, output }));
    });
  /** The JSON document a command prints last: it starts on a line of its own. */
  const json = ({ output }) => JSON.parse(output.slice(output.lastIndexOf('\n{\n') + 1));
  const worlds = async () =>
    (await client.db('cyberia-content').collection('cyberiainstances').find().sort({ code: 1 }).toArray()).map(
      ({ code, cyberiaMapCodes, revision }) => ({ code, maps: cyberiaMapCodes, revision }),
    );

  beforeAll(async () => {
    sagaCode = contentArtifact().manifest.sagas[0];
    mongod = await startMongod('cyberia', { replSet: 'cliset' });
    client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
    pod = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-saga-cli-'));
    fs.mkdirSync(`${pod}/engine-private/conf/dd-x`, { recursive: true });
    fs.writeFileSync(
      `${pod}/engine-private/conf/dd-x/conf.server.json`,
      JSON.stringify({
        h: {
          '/': {
            apis: APIS,
            db: {
              provider: 'mongoose',
              host: mongod.host,
              name: 'cyberia',
              replicaSet: 'cliset',
              partitions: { content: { name: 'cyberia-content', apis: APIS } },
            },
          },
        },
      }),
    );
    for (const args of [
      ['content', 'import'],
      ['instance', 'snapshot', 'test', '--import'],
      ['instance', 'snapshot', 'fallback', '--import'],
    ]) {
      const result = await run(...args);
      expect(result.status, `${args.join(' ')}\n${result.output}`).toBe(0);
    }
  }, 300000);

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
    if (pod) fs.rmSync(pod, { recursive: true, force: true });
  });

  it('plans, imports, and imports again, and leaves the other worlds as they are', async () => {
    const others = await worlds();
    expect(others.map(({ code }) => code)).toEqual(['fallback', 'test']);
    const { cyberiaMapCodes } = contentArtifact().saga(sagaCode).instance;

    const planned = await run('content', 'import', '--saga', sagaCode, '--dry-run');
    expect(planned.status, planned.output).toBe(0);
    expect(json(planned)).toMatchObject({
      dryRun: true,
      database: 'cyberia-content',
      targetInstance: { code: sagaCode, created: true },
      instanceConf: { created: true },
      maps: { attached: cyberiaMapCodes },
    });
    expect(await worlds()).toEqual(others);

    const imported = await run('content', 'import', '--saga', sagaCode);
    expect(imported.status, imported.output).toBe(0);
    const report = json(imported);
    expect(report).toMatchObject({
      artifact: { digest: contentArtifact().manifest.contentDigest },
      saga: { code: sagaCode, status: 'inserted' },
      targetInstance: { code: sagaCode, created: true, confLinked: false },
      instanceConf: { created: true },
      maps: { attached: cyberiaMapCodes, ownedElsewhere: [] },
      conflicts: [],
      registry: { defects: [] },
    });
    expect(report.instanceConf.defaultsAdded).toBeGreaterThan(0);
    const after = await worlds();
    expect(after.filter(({ code }) => code !== sagaCode)).toEqual(others);
    expect(after.find(({ code }) => code === sagaCode).maps).toEqual(cyberiaMapCodes);

    const again = await run('content', 'import', '--saga', sagaCode);
    expect(again.status, again.output).toBe(0);
    expect(json(again)).toMatchObject({
      saga: { status: 'in-sync' },
      targetInstance: { created: false, confLinked: false },
      instanceConf: { created: false, defaultsAdded: 0 },
      maps: { attached: [], alreadyAttached: cyberiaMapCodes },
    });
    expect(await worlds()).toEqual(after);
  }, 300000);

  it('refuses a named world that does not exist with a 404 report and exit 1', async () => {
    const refused = await run('content', 'import', '--saga', sagaCode, '--instance', 'cyberia-mian');
    expect(refused.status).toBe(1);
    expect(json(refused).errors).toEqual([expect.objectContaining({ status: 404 })]);
    expect((await worlds()).map(({ code }) => code)).not.toContain('cyberia-mian');
  }, 120000);

  it('lists the worlds and the sagas, and inspects one saga', async () => {
    const listed = await run('instance', 'list');
    expect(listed.status, listed.output).toBe(0);
    expect(json(listed)).toContainEqual(expect.objectContaining({ code: sagaCode, conf: 'linked', sagas: [sagaCode] }));

    const sagas = await run('content', 'saga', 'list', '--workspace', 'in-sync');
    expect(sagas.status, sagas.output).toBe(0);
    expect(json(sagas).data.map(({ code }) => code)).toEqual([sagaCode]);

    const inspected = await run('content', 'saga', 'inspect', sagaCode);
    expect(inspected.status, inspected.output).toBe(0);
    expect(json(inspected)).toMatchObject({
      code: sagaCode,
      artifact: { present: true },
      workspace: { status: 'in-sync' },
      instances: [sagaCode],
    });
  }, 120000);
});
