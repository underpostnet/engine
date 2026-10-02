import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import {
  CONTENT_FAMILIES,
  auditContent,
  contentArtifact,
  hasContentArtifact,
  importContent,
  importSaga,
  readDatabaseContent,
} from '../../../src/projects/cyberia/content-artifact.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// One host that is its own Object Layer authority, so definitions are stored here. IPFS points at
// a closed port: a pin failure is a warning, never a failed write.
const host = { host: 'cyberia-content.test', path: '/', consumes: {} };
const APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'cyberia-item-catalog',
  'cyberia-skill',
  'cyberia-saga',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-map',
  'cyberia-quest',
  'cyberia-dialogue',
  'cyberia-action',
  'cyberia-entity-type-default',
];
const MODELS = {
  entityTypeDefaults: 'CyberiaEntityTypeDefault',
  skills: 'CyberiaSkill',
  maps: 'CyberiaMap',
  quests: 'CyberiaQuest',
  dialogues: 'CyberiaDialogue',
  actions: 'CyberiaAction',
};
let artifact;
let foundation;
let sagaCode;
let saga;

let mongod;
const models = () => DataBaseProviderService.getProvider(host, 'mongoose').models;
const importFoundation = (rebind = false) =>
  importContent({ families: foundation, models: models(), context: host, rebind });
const allInSync = ({ plan }) =>
  plan.objectLayers.every(({ status }) => status === 'in-sync') &&
  Object.values(plan.documents).every((entries) => entries.every(({ status }) => status === 'in-sync'));

// The artifact is a built cyberia-content checkout of the workspace; this suite imports it.
describe.skipIf(!mongodBinary || !hasContentArtifact())('content artifact import on a real MongoDB', () => {
  beforeAll(async () => {
    artifact = contentArtifact();
    foundation = artifact.foundation;
    [sagaCode] = artifact.manifest.sagas;
    saga = artifact.saga(sagaCode);
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', 'DEFAULT_DEPLOY_ID'])
      delete process.env[key];
    process.env.IPFS_API_URL = 'http://127.0.0.1:9';
    process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
    mongod = await startMongod('cyberia', { replSet: 'contentset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...host,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'contentset', name: 'cyberia-content' },
    });
  });

  afterAll(async () => {
    await DataBaseProviderService.getProvider(host)
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${host.host}${host.path}`];
    await mongod?.stop();
  });

  it('imports every document family of the foundation, beyond Object Layer definitions', async () => {
    const result = await importFoundation();
    expect(result.objectLayers).toBe(foundation.objectLayers.length);
    expect(await models().CyberiaItemCatalog.countDocuments()).toBe(foundation.objectLayers.length);
    for (const [family, model] of Object.entries(MODELS)) {
      expect(await models()[model].countDocuments(), family).toBe(foundation[family].length);
      expect(foundation[family].length, family).toBeGreaterThan(0);
    }
    expect(Object.keys(result.written)).toEqual(Object.keys(CONTENT_FAMILIES).filter((f) => f !== 'objectLayers'));
  });

  it('stores functional content with render unresolved, and maps without entities', async () => {
    const coin = await models()
      .ObjectLayer.findByCid((await models().CyberiaItemCatalog.findOne({ itemId: 'coin' }).lean()).objectLayerCid)
      .lean();
    expect(coin.data.item.description).toBe(artifact.byItemId.get('coin').payload.data.item.description);
    expect(coin.data.render).toEqual({ cid: '', metadataCid: '' });

    const outpost = await models().CyberiaMap.findOne({ code: 'frontier-outpost' }).lean();
    expect(outpost.entities).toEqual([]);

    const raider = await models()
      .CyberiaEntityTypeDefault.findOne({ entityType: 'bot', liveItemIds: ['ash-raider', 'scrap-maul'] })
      .lean();
    expect(raider).toMatchObject({ behavior: 'hostile', deadItemIds: ['fragmentation'] });
    expect(await models().CyberiaSkill.countDocuments({ triggerItemId: 'atlas-pistol-mk2' })).toBe(1);

    const [quest] = foundation.quests;
    const storedQuest = await models().CyberiaQuest.findOne({ code: quest.code }).lean();
    expect(storedQuest.steps.map(({ id }) => id)).toEqual(quest.steps.map(({ id }) => id));
    expect([storedQuest.sourceMapCode, storedQuest.sourceCellX, storedQuest.sourceCellY]).toEqual([null, null, null]);
    const [action] = foundation.actions;
    const storedAction = await models().CyberiaAction.findOne({ code: action.code }).lean();
    expect(storedAction.questDialogueCodes.map(({ dialogCode }) => dialogCode)).toEqual(['quest-talk-raider-toll']);
    expect(await models().CyberiaDialogue.countDocuments({ code: 'quest-talk-raider-toll' })).toBe(2);
  });

  it('is idempotent: a second import finds every definition and document in sync, and writes nothing', async () => {
    const before = await models().ObjectLayer.countDocuments();
    const result = await importFoundation();
    expect(allInSync(result)).toBe(true);
    expect(result.objectLayers).toBe(0);
    expect(Object.values(result.written).every((count) => count === 0)).toBe(true);
    expect(await models().ObjectLayer.countDocuments()).toBe(before);
  });

  it('never overwrites what Studio authored: placed entities and quest sources survive a rebind', async () => {
    const [quest] = foundation.quests;
    await models().CyberiaMap.updateOne(
      { code: 'frontier-outpost' },
      { $set: { entities: [{ entityType: 'floor', objectLayerItemIds: ['ash-crust'], initCellX: 3, initCellY: 4 }] } },
    );
    await models().CyberiaQuest.updateOne(
      { code: quest.code },
      { $set: { sourceMapCode: 'frontier-outpost', sourceCellX: 5, sourceCellY: 6, title: 'Edited' } },
    );
    const result = await importFoundation(true);
    const status = (family, key) => result.plan.documents[family].find(({ doc }) => doc.code === key).status;
    expect(status('maps', 'frontier-outpost')).toBe('in-sync');
    expect(status('quests', quest.code)).toBe('differs');

    const outpost = await models().CyberiaMap.findOne({ code: 'frontier-outpost' }).lean();
    expect([outpost.entities[0].initCellX, outpost.entities[0].initCellY]).toEqual([3, 4]);
    const storedQuest = await models().CyberiaQuest.findOne({ code: quest.code }).lean();
    expect(storedQuest).toMatchObject({ title: quest.title, sourceMapCode: 'frontier-outpost', sourceCellX: 5 });
  });

  it('imports the artifact saga over the foundation, twice, to the same state, with a runnable instance', async () => {
    const first = await importSaga({ saga, models: models(), context: host });
    const second = await importSaga({ saga, models: models(), context: host });
    expect(first.objectLayers).toBe(saga.families.objectLayers.length);
    expect(second.objectLayers).toBe(0);
    expect(allInSync(second)).toBe(true);

    for (const quest of saga.families.quests) {
      const stored = await models().CyberiaQuest.findOne({ code: quest.code }).lean();
      expect(stored.steps[0].objectives[0].itemId).toBe(quest.steps[0].objectives[0].itemId);
      expect(stored.sourceMapCode).toBe(null);
    }
    for (const map of saga.families.maps)
      expect((await models().CyberiaMap.findOne({ code: map.code }).lean()).entities).toEqual([]);
    const storedSaga = await models().CyberiaSaga.findOne({ code: sagaCode }).lean();
    expect(storedSaga.definitions.map(({ id }) => id)).toEqual(saga.saga.definitions.map(({ id }) => id));

    const instance = await models().CyberiaInstance.findOne({ code: sagaCode }).lean();
    expect(instance.cyberiaMapCodes).toEqual(saga.instance.cyberiaMapCodes);
    const conf = await models().CyberiaInstanceConf.findOne({ instanceCode: sagaCode }).lean();
    expect(String(instance.conf)).toBe(String(conf._id));
    expect(conf.entityDefaults.map(String).sort()).toEqual(first.entityTypeDefaultIds.map(String).sort());
    expect(conf.entityDefaults).toHaveLength(saga.families.entityTypeDefaults.length);
  });

  it('audits the database: foundation labels in sync, saga labels owned by their saga', async () => {
    const report = auditContent({ content: await readDatabaseContent(models()) });
    expect(report.foundation.every(({ status }) => status === 'in-sync')).toBe(true);
    expect(report.generated.map(({ itemId }) => itemId).sort()).toEqual(
      saga.families.objectLayers.map(({ itemId }) => itemId).sort(),
    );
    expect(report.generated.every((entry) => entry.saga === sagaCode)).toBe(true);
    expect(report.unresolved).toEqual([]);
    expect(report.skills.every(({ status }) => status !== 'differs')).toBe(true);
  });
});
