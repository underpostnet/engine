import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
import { buildReport } from '../../../src/projects/cyberia/saga/saga-report.js';
import { syncSaga } from '../../../src/projects/cyberia/saga/saga-sync.js';
import { profileRef } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// The completeness report of a saga on a real MongoDB, in one world that hosts two sagas. The sagas
// share the outpost map and the pistol item; one links a quest to another provider. The report reads
// what is stored and never writes; the host serves no content artifact.
const options = { host: 'saga-report-test', path: '/' };
const model = (name) => DataBaseProviderService.getModel(name, options);

const quest = (code, { steps, rewards, prerequisiteCodes = [], unlocksQuestCodes = [] }) => ({
  code,
  title: code,
  description: `The ${code} quest.`,
  prerequisiteCodes,
  unlocksQuestCodes,
  sourceMapCode: null,
  sourceCellX: null,
  sourceCellY: null,
  steps,
  rewards,
});
const QUESTS = [
  quest('raider-toll', {
    unlocksQuestCodes: ['supply-run'],
    steps: [
      { id: 'hunt', description: 'Hunt raiders.', objectives: [{ type: 'kill', itemId: 'raider', quantity: 2 }] },
    ],
    rewards: [{ itemId: 'pistol', quantity: 1 }],
  }),
  quest('supply-run', {
    prerequisiteCodes: ['raider-toll'],
    steps: [
      { id: 'ask', description: 'Ask the merchant.', objectives: [{ type: 'talk', itemId: 'merchant', quantity: 1 }] },
      { id: 'gather', description: 'Gather scrap.', objectives: [{ type: 'collect', itemId: 'scrap', quantity: 3 }] },
    ],
    rewards: [{ itemId: 'relic', quantity: 1 }],
  }),
];
const STALL = {
  code: 'drift-stall',
  label: 'Drift Stall',
  dialogCode: 'default-merchant',
  sourceMapCode: null,
  sourceCellX: null,
  sourceCellY: null,
  questDialogueCodes: [{ questCode: 'supply-run', dialogCode: 'quest-talk-supply-run' }],
  shopItems: [{ itemId: 'pistol', priceItemId: 'coin', priceQty: 30 }],
  craftRecipes: [],
  storageSlots: 0,
  buybackItems: ['pistol'],
  burnItems: [],
  market: { marketCode: 'bazaar', selection: 'policy', itemIds: [], listingModes: ['fixed'] },
};
const MERCHANT_DEFAULT = {
  entityType: 'bot',
  liveItemIds: ['merchant', 'pistol'],
  deadItemIds: [],
  dropItemIds: [],
  inventoryItemsIds: [],
  overrideItemsIdsState: [],
  behavior: 'provider',
};
const FRONTIER = {
  code: 'frontier',
  name: 'Frontier',
  description: 'Raiders on the outpost.',
  foundationVersion: '3.0.0',
  references: ['currency.coin'],
  definitions: [{ id: 'map.outpost' }, { id: 'quest.raider-toll' }, { id: 'quest.supply-run' }],
  mapCodes: ['outpost'],
  itemIds: ['coin', 'merchant', 'pistol', 'relic'],
  questCodes: [
    { providerSkinItemId: 'merchant', questCode: 'raider-toll', mapCode: 'outpost' },
    { providerSkinItemId: 'merchant', questCode: 'supply-run', mapCode: 'outpost' },
  ],
  actionCodes: [{ providerSkinItemId: 'merchant', actionCode: 'drift-stall', mapCode: 'outpost' }],
};
const FAMILIES = {
  objectLayers: [],
  entityTypeDefaults: [MERCHANT_DEFAULT],
  skills: [],
  maps: [{ code: 'outpost', name: 'Outpost', description: 'A walled outpost.', tags: ['dust'] }],
  quests: QUESTS,
  dialogues: [{ code: 'quest-talk-supply-run', order: 0, speaker: 'Merchant', text: 'Scrap, then.', mood: 'happy' }],
  markets: [],
  actions: [STALL],
  economies: [],
};
const SEMANTIC = {
  code: 'frontier',
  source: { kind: 'candidate', revision: 3, digest: 'sha256:frontier' },
  findings: [],
  compiled: { saga: FRONTIER, families: FAMILIES },
  context: {
    definitions: {
      'map.outpost': {
        id: 'map.outpost',
        composition: [
          { entity: 'character.merchant', count: 1 },
          { entity: 'character.raider', count: 2 },
        ],
      },
    },
    sources: {
      'map.outpost': 'frontier',
      'quest.raider-toll': 'frontier',
      'quest.supply-run': 'frontier',
      'skin.merchant': 'frontier',
      'weapon.pistol': 'frontier',
      'currency.coin': 'foundation',
    },
    labels: { merchant: 'skin.merchant', pistol: 'weapon.pistol', coin: 'currency.coin' },
    entities: {
      'character.merchant': { entityType: 'bot', objectLayerItemIds: ['merchant', 'pistol'] },
      'character.raider': { entityType: 'bot', objectLayerItemIds: ['raider'] },
    },
    references: { 'quest.raider-toll': [{ field: 'rewards.item', id: 'weapon.pistol' }] },
    referencedBy: {},
  },
  package: {
    saga: { code: 'frontier', name: 'Frontier', description: 'Raiders on the outpost.' },
    references: ['currency.coin'],
    definitions: [
      { id: 'map.outpost' },
      { id: 'quest.raider-toll', unlocks: ['quest.supply-run'], rewards: [{ item: 'weapon.pistol', quantity: 1 }] },
      { id: 'quest.supply-run', prerequisites: ['quest.raider-toll'] },
    ],
  },
};

/** Stores a definition of an item and binds the item to it; a rendered one gets a render and an atlas. */
const bindItem = async (itemId, { rendered = false } = {}) => {
  const data = { item: { id: itemId, type: 'weapon' }, stats: CyberiaObjectLayerProfile.validateStats({ effect: 1 }) };
  if (rendered) data.render = { cid: `render-${itemId}` };
  const { cid } = await model('ObjectLayer').upsertByIdentity(
    { profile: profileRef(CyberiaObjectLayerProfile), data },
    { origin: 'cache' },
  );
  await model('CyberiaItemCatalog').bind(itemId, cid, { expectedCid: null, source: 'content' });
  if (rendered)
    await model('AtlasSpriteSheet').collection.insertOne({ objectLayerCid: cid, fileId: new Types.ObjectId() });
};
const bot = (itemIds, initCellX, initCellY) => ({
  entityType: 'bot',
  initCellX,
  initCellY,
  objectLayerItemIds: itemIds,
});
const rowOf = (report, key) => report.rows.find((row) => row.key === key);
const gate = (report, id) => report.gates.find((entry) => entry.id === id).status;
const report = (extra = {}) => buildReport({ options, semantic: SEMANTIC, ...extra });

describe.skipIf(!mongodBinary)('the completeness report of two sagas in one world', () => {
  let mongod;
  let emptyContent;
  let populationId;
  let jobId;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    emptyContent = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-no-content-'));
    process.env.CYBERIA_CONTENT_ROOT = emptyContent;
    mongod = await startMongod('cyberia-saga-report');
    await DataBaseProviderService.load({
      apis: [
        'cyberia-saga',
        'cyberia-map',
        'cyberia-instance',
        'cyberia-instance-conf',
        'cyberia-universe',
        'cyberia-quest',
        'cyberia-action',
        'cyberia-dialogue',
        'cyberia-skill',
        'cyberia-market',
        'cyberia-entity-type-default',
        'cyberia-economy',
        'cyberia-economic-item-policy',
        'cyberia-item-catalog',
        'object-layer',
        'atlas-sprite-sheet',
        'cyberia-procedural-job',
        'cyberia-procedural-job-item',
        'cyberia-procedural-population',
      ],
      ...options,
      db: { provider: 'mongoose', host: mongod.host, name: 'cyberia-saga-report' },
    });
  });

  afterAll(async () => {
    await DataBaseProviderService.getProvider(options)
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${options.host}${options.path}`];
    await mongod?.stop();
    fs.rmSync(emptyContent, { recursive: true, force: true });
    delete process.env.CYBERIA_CONTENT_ROOT;
  });

  beforeEach(async () => {
    for (const name of [
      'CyberiaSaga',
      'CyberiaMap',
      'CyberiaInstance',
      'CyberiaInstanceConf',
      'CyberiaQuest',
      'CyberiaAction',
      'CyberiaDialogue',
      'CyberiaEntityTypeDefault',
      'CyberiaEconomy',
      'CyberiaEconomicItemPolicy',
      'CyberiaItemCatalog',
      'ObjectLayer',
      'AtlasSpriteSheet',
      'CyberiaProceduralJobItem',
      'CyberiaProceduralPopulation',
    ])
      await model(name).deleteMany({});
    await model('CyberiaSaga').create([
      FRONTIER,
      {
        code: 'caravan',
        name: 'Caravan',
        mapCodes: ['camp'],
        itemIds: ['courier', 'pistol'],
        questCodes: [
          { providerSkinItemId: 'courier', questCode: 'escort', mapCode: '' },
          { providerSkinItemId: 'bandit', questCode: 'raider-toll', mapCode: 'outpost' },
        ],
      },
    ]);
    await model('CyberiaMap').create([
      { code: 'outpost', entities: [bot(['merchant', 'pistol'], 2, 3), bot(['courier'], 5, 5)] },
      { code: 'camp', entities: [] },
    ]);
    const conf = await model('CyberiaInstanceConf').create({ instanceCode: 'frontier-world', economyCode: 'standard' });
    await model('CyberiaInstance').create({
      code: 'frontier-world',
      cyberiaMapCodes: ['outpost', 'camp'],
      conf: conf._id,
    });
    await model('CyberiaEconomy').create({ code: 'standard', name: 'Standard' });
    await model('CyberiaEconomicItemPolicy').create({ economyCode: 'standard', itemId: 'pistol', buyback: false });
    await model('CyberiaQuest').create([
      ...QUESTS,
      { code: 'escort', title: 'Escort', sourceMapCode: 'outpost', sourceCellX: 5, sourceCellY: 5 },
    ]);
    await model('CyberiaAction').create({
      ...STALL,
      questDialogueCodes: [],
      sourceMapCode: 'outpost',
      sourceCellX: 2,
      sourceCellY: 3,
    });
    await model('CyberiaDialogue').create([
      { code: 'default-merchant', order: 0, speaker: 'Merchant', text: 'Welcome.', mood: 'neutral' },
      ...FAMILIES.dialogues,
    ]);
    await model('CyberiaEntityTypeDefault').create(MERCHANT_DEFAULT);
    for (const itemId of ['merchant', 'pistol']) await bindItem(itemId);
    await bindItem('coin', { rendered: true });
    populationId = (
      await model('CyberiaProceduralPopulation').collection.insertOne({
        mapCode: 'outpost',
        status: 'open',
        targets: [{ itemId: 'pistol' }],
        updatedAt: new Date(),
      })
    ).insertedId;
    jobId = new Types.ObjectId();
    await model('CyberiaProceduralJobItem').collection.insertOne({
      jobId,
      targetItemId: 'merchant',
      status: 'review',
      createdAt: new Date(),
    });
  });

  it('passes the content rules and lists where each definition comes from', async () => {
    const result = await report();
    expect(gate(result, 'semantic')).toBe('pass');
    expect(rowOf(result, 'definition:currency.coin')).toMatchObject({ status: 'foundation', level: 'ok' });
    expect(rowOf(result, 'definition:quest.raider-toll')).toMatchObject({ status: 'defined' });
    const { narrative } = result.graphs;
    expect(narrative.edges).toEqual(
      expect.arrayContaining([
        { from: 'saga:frontier', to: 'quest.raider-toll', type: 'starts' },
        { from: 'quest.raider-toll', to: 'quest.supply-run', type: 'unlocks' },
        { from: 'quest.raider-toll', to: 'weapon.pistol', type: 'reward' },
      ]),
    );
    expect(narrative.edges.filter(({ type }) => type === 'unlocks')).toHaveLength(1);
    expect(narrative.nodes.find(({ id }) => id === 'quest.raider-toll')).toMatchObject({
      kind: 'quest',
      status: 'defined',
      link: { view: 'action-engine', questCode: 'raider-toll' },
    });
    expect(narrative.nodes.find(({ id }) => id === 'weapon.pistol')).toMatchObject({
      kind: 'weapon',
      status: 'defined',
    });
  });

  it('shows the map and the item both sagas share, and the world that hosts them', async () => {
    const result = await report();
    expect(rowOf(result, 'map:outpost')).toMatchObject({
      sagas: ['caravan', 'frontier'],
      instances: ['frontier-world'],
      status: 'shared',
      message: expect.stringContaining('shared with caravan'),
    });
    expect(rowOf(result, 'item:pistol')).toMatchObject({ sagas: ['caravan', 'frontier'] });
    expect(result.graphs.composition.edges).toEqual(
      expect.arrayContaining([
        { from: 'saga:frontier', to: 'map.outpost', type: 'owns' },
        { from: 'map.outpost', to: 'character.raider', type: 'composes', count: 2 },
        { from: 'saga:caravan', to: 'map.outpost', type: 'shares' },
        { from: 'map.outpost', to: 'instance:frontier-world', type: 'in world' },
      ]),
    );
  });

  it('shows a place of the saga with the saga that owns it, and leaves its composition to that saga', async () => {
    const semantic = structuredClone(SEMANTIC);
    semantic.compiled.saga.placeCodes = ['camp'];
    semantic.context.sources['map.camp'] = 'caravan';
    semantic.context.definitions['map.camp'] = {
      id: 'map.camp',
      composition: [{ entity: 'character.raider', count: 9 }],
    };
    const result = await buildReport({ options, semantic });
    expect(rowOf(result, 'map:camp')).toMatchObject({
      place: true,
      source: 'caravan',
      status: 'shared',
      instances: ['frontier-world'],
      message: expect.stringContaining('A place of this saga; caravan owns it'),
    });
    expect(result.rows.filter(({ key }) => key.startsWith('placement:camp'))).toEqual([]);
    expect(result.graphs.composition.edges).toContainEqual({ from: 'saga:frontier', to: 'map.camp', type: 'place' });
  });

  it('delegates each missing render to the procedural work that owns it, and blocks on an unbound reward', async () => {
    const result = await report();
    expect(rowOf(result, 'item:pistol')).toMatchObject({
      status: 'missing-render',
      remedy: 'generate',
      link: { view: 'procedural', populationId: String(populationId), itemId: 'pistol' },
    });
    expect(rowOf(result, 'item:merchant')).toMatchObject({ link: { view: 'procedural', jobId: String(jobId) } });
    expect(rowOf(result, 'item:coin')).toMatchObject({ status: 'ready', level: 'ok' });
    expect(rowOf(result, 'item:relic')).toMatchObject({ status: 'missing-binding', level: 'error' });
    expect(rowOf(result, 'placement:outpost:character.raider')).toMatchObject({
      status: 'missing-placement',
      level: 'error',
      link: { view: 'procedural', populationId: String(populationId) },
    });
    expect(gate(result, 'visual')).toBe('blocked');
  });

  it('refuses the provider another saga links to another skin, and its synchronization', async () => {
    const result = await report();
    expect(rowOf(result, 'provider:quest:raider-toll')).toMatchObject({
      status: 'invalid',
      level: 'error',
      conflicts: [{ saga: 'caravan', providerSkinItemId: 'bandit', mapCode: 'outpost' }],
    });
    expect(gate(result, 'spatial')).toBe('blocked');
    await expect(syncSaga({ options, code: 'frontier', apply: true })).rejects.toMatchObject({ status: 409 });
  });

  it('finds the objectives the runtime cannot advance', async () => {
    const result = await report();
    expect(rowOf(result, 'objective:raider-toll:kill:raider')).toMatchObject({
      status: 'missing-relationship',
      level: 'error',
    });
    expect(rowOf(result, 'objective:supply-run:collect:scrap')).toMatchObject({ level: 'warning' });
    expect(rowOf(result, 'objective:supply-run:talk:merchant')).toMatchObject({
      status: 'missing-dialogue',
      level: 'error',
      remedy: 'sync',
      message: expect.stringContaining('any finished dialogue with merchant completes it'),
    });
    expect(gate(result, 'narrative')).toBe('blocked');
  });

  it('blocks the economy on a missing market profile and a buyback the item policy refuses', async () => {
    const result = await report();
    expect(rowOf(result, 'market:drift-stall')).toMatchObject({ status: 'invalid-capability', level: 'error' });
    expect(rowOf(result, 'economy:drift-stall:frontier-world:buyback:pistol')).toMatchObject({
      level: 'error',
      message: expect.stringContaining('the economy refuses buyback of this item'),
    });
    expect(gate(result, 'economy')).toBe('blocked');
  });

  it('is not release-ready while the candidate is a draft and the artifact lacks it', async () => {
    const result = await report({ applied: null });
    expect(rowOf(result, 'release:applied')).toMatchObject({ level: 'error', remedy: 'apply' });
    expect(rowOf(result, 'release:built')).toMatchObject({ level: 'error' });
    expect(gate(result, 'release')).toBe('blocked');
  });

  it('leaves out a row a moderator excludes, with the reason', async () => {
    const exclusions = [
      { key: 'objective:supply-run:collect:scrap', reason: 'Scrap drops in a later saga', actor: 'm', at: new Date() },
    ];
    const result = await report({ exclusions });
    expect(rowOf(result, 'objective:supply-run:collect:scrap')).toMatchObject({
      level: 'excluded',
      remedy: 'excluded',
      exclusion: { reason: 'Scrap drops in a later saga' },
    });
  });

  it('clears the provider and the talk once the sagas agree and the saga synchronizes', async () => {
    await model('CyberiaSaga').updateOne(
      { code: 'caravan' },
      { $set: { 'questCodes.1': { providerSkinItemId: 'merchant', questCode: 'raider-toll', mapCode: 'outpost' } } },
    );
    for (const itemId of ['raider', 'scrap', 'relic']) await bindItem(itemId);
    const synced = await syncSaga({ options, code: 'frontier', apply: true });
    expect(synced.counts.conflict).toBe(0);
    const result = await report();
    expect(rowOf(result, 'provider:quest:raider-toll')).toMatchObject({ status: 'ready', level: 'ok' });
    expect(rowOf(result, 'objective:supply-run:talk:merchant')).toMatchObject({ status: 'ready', level: 'ok' });
    expect(await model('CyberiaQuest').findOne({ code: 'raider-toll' }).lean()).toMatchObject({
      sourceMapCode: 'outpost',
      sourceCellX: 2,
      sourceCellY: 3,
    });
  });
});
