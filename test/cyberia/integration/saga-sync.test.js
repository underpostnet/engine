import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { syncSaga } from '../../../src/projects/cyberia/saga/saga-sync.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { profileRef } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';

// A saga synchronization on a real MongoDB: what it assigns from the stored maps and dialogues, what
// it keeps, what fails and what it omits. A check writes nothing, and a quest or an action that names
// an item that cannot run is never placed.
const options = { host: 'saga-sync-test', path: '/' };
const model = (name) => DataBaseProviderService.getModel(name, options);
/** Stores a definition of an item, without a render, and binds the item to it. */
const bindItemOf = async (itemId) => {
  const { cid } = await model('ObjectLayer').upsertByIdentity(
    {
      profile: profileRef(CyberiaObjectLayerProfile),
      data: { item: { id: itemId, type: 'weapon' }, stats: CyberiaObjectLayerProfile.validateStats({ effect: 1 }) },
    },
    { origin: 'cache' },
  );
  await model('CyberiaItemCatalog').bind(itemId, cid, { expectedCid: null, source: 'content' });
};
const entity = (itemId, initCellX, initCellY) => ({
  entityType: 'bot',
  initCellX,
  initCellY,
  objectLayerItemIds: [itemId],
});
const outcomes = (report) =>
  Object.fromEntries(report.entries.map(({ kind, code, outcome }) => [`${kind}:${code}`, outcome]));
const detailOf = (report, kind, code) =>
  report.entries.find((entry) => entry.kind === kind && entry.code === code).detail;
const stored = (name, code) => model(name).findOne({ code }).lean();

const EXPECTED = {
  'quest:raider-toll': 'assigned',
  'quest:night-watch': 'kept',
  'quest:haunt': 'omitted',
  'quest:lost-quest': 'failed',
  'action:drift-stall': 'assigned',
  'action:hermit-hut': 'omitted',
  'dialogue:default-merchant': 'assigned',
  'dialogue:quest-talk-raider-toll': 'assigned',
  'dialogue:quest-talk-lost-quest': 'omitted',
  'dialogue:hermit-hello': 'failed',
  'skill:pistol': 'kept',
  'skill:wand': 'failed',
};

describe.skipIf(!mongodBinary)('saga synchronization on a real MongoDB', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('cyberia-saga-sync');
    await DataBaseProviderService.load({
      apis: [
        'cyberia-saga',
        'cyberia-instance',
        'cyberia-map',
        'cyberia-quest',
        'cyberia-action',
        'cyberia-dialogue',
        'cyberia-skill',
        'cyberia-item-catalog',
        'object-layer',
        'atlas-sprite-sheet',
      ],
      ...options,
      db: { provider: 'mongoose', host: mongod.host, name: 'cyberia-saga-sync' },
    });
  });

  afterAll(async () => {
    await DataBaseProviderService.getProvider(options)
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${options.host}${options.path}`];
    await mongod?.stop();
  });

  beforeEach(async () => {
    for (const name of [
      'CyberiaSaga',
      'CyberiaInstance',
      'CyberiaMap',
      'CyberiaQuest',
      'CyberiaAction',
      'CyberiaDialogue',
      'CyberiaSkill',
      'CyberiaItemCatalog',
      'ObjectLayer',
    ])
      await model(name).deleteMany({});
    await model('CyberiaSaga').create({
      code: 'frontier',
      name: 'The Frontier',
      mapCodes: ['outpost', 'ruins'],
      itemIds: ['merchant', 'pistol', 'wand'],
      questCodes: [
        { providerSkinItemId: 'merchant', questCode: 'raider-toll', mapCode: 'outpost' },
        { providerSkinItemId: 'guard', questCode: 'night-watch' },
        { providerSkinItemId: 'ghost', questCode: 'haunt', mapCode: 'outpost' },
        { providerSkinItemId: 'merchant', questCode: 'lost-quest', mapCode: 'outpost' },
      ],
      actionCodes: [
        { providerSkinItemId: 'merchant', actionCode: 'drift-stall', mapCode: 'outpost' },
        { providerSkinItemId: 'hermit', actionCode: 'hermit-hut', mapCode: 'swamp' },
      ],
    });
    await model('CyberiaMap').create([
      { code: 'outpost', entities: [entity('merchant', 3, 4), entity('guard', 7, 2), entity('merchant', 9, 9)] },
      { code: 'ruins', entities: [entity('hermit', 1, 1)] },
    ]);
    await model('CyberiaQuest').create([
      { code: 'raider-toll', title: 'Raider Toll' },
      { code: 'night-watch', title: 'Night Watch', sourceMapCode: 'outpost', sourceCellX: 7, sourceCellY: 2 },
      { code: 'haunt', title: 'Haunt' },
    ]);
    await model('CyberiaAction').create([{ code: 'drift-stall' }, { code: 'hermit-hut', dialogCode: 'hermit-hello' }]);
    await model('CyberiaDialogue').create([
      { code: 'default-merchant', text: 'Welcome.' },
      { code: 'quest-talk-raider-toll', text: 'The raiders burned the palisade.' },
    ]);
    await model('CyberiaSkill').create([
      {
        triggerItemId: 'pistol',
        logicEventIds: ['projectile'],
        skills: [
          { logicEventId: 'projectile', summonedEntityItemId: 'bullet' },
          { logicEventId: 'projectile', summonedEntityItemId: '$active_skin' },
        ],
      },
      {
        triggerItemId: 'wand',
        logicEventIds: ['projectile'],
        skills: [{ logicEventId: 'projectile', summonedEntityItemId: 'orb' }],
      },
    ]);
    for (const itemId of ['pistol', 'bullet', 'wand']) await bindItemOf(itemId);
  });

  it('checks every link of the saga and writes nothing', async () => {
    const report = await syncSaga({ options, code: 'frontier' });
    expect(report.saga).toEqual({ code: 'frontier', name: 'The Frontier' });
    expect(report.applied).toBe(false);
    expect(outcomes(report)).toEqual(EXPECTED);
    expect(report.counts).toEqual({ assigned: 4, kept: 2, failed: 3, omitted: 3 });
    expect(detailOf(report, 'quest', 'raider-toll')).toBe('merchant at outpost (3, 4), first of 2');
    expect(detailOf(report, 'quest', 'night-watch')).toBe('guard at outpost (7, 2)');
    expect(detailOf(report, 'quest', 'haunt')).toBe('no entity of map outpost has ghost');
    expect(detailOf(report, 'action', 'hermit-hut')).toBe('map swamp is not stored');
    expect(detailOf(report, 'skill', 'wand')).toBe('items that cannot run: orb (unbound)');
    expect((await stored('CyberiaQuest', 'raider-toll')).sourceMapCode).toBeUndefined();
    expect((await stored('CyberiaAction', 'drift-stall')).dialogCode).toBe('');
  });

  it('places the quests and the actions at their providers and links the stored dialogues', async () => {
    const report = await syncSaga({ options, code: 'frontier', apply: true });
    expect(report.applied).toBe(true);
    expect(outcomes(report)).toEqual(EXPECTED);
    expect(await stored('CyberiaQuest', 'raider-toll')).toMatchObject({
      sourceMapCode: 'outpost',
      sourceCellX: 3,
      sourceCellY: 4,
    });
    const stall = await stored('CyberiaAction', 'drift-stall');
    expect(stall).toMatchObject({
      sourceMapCode: 'outpost',
      sourceCellX: 3,
      sourceCellY: 4,
      dialogCode: 'default-merchant',
    });
    expect(stall.questDialogueCodes.map(({ questCode, dialogCode }) => ({ questCode, dialogCode }))).toEqual([
      { questCode: 'raider-toll', dialogCode: 'quest-talk-raider-toll' },
    ]);
    const hut = await stored('CyberiaAction', 'hermit-hut');
    expect(hut.sourceMapCode).toBeUndefined();
    expect(hut.dialogCode).toBe('hermit-hello');
  });

  it('keeps on a second run what the first run assigned', async () => {
    await syncSaga({ options, code: 'frontier', apply: true });
    const report = await syncSaga({ options, code: 'frontier', apply: true });
    expect(report.counts).toEqual({ assigned: 0, kept: 6, failed: 3, omitted: 3 });
  });

  it('leaves a quest or an action where it is while an item it names cannot run', async () => {
    await model('CyberiaQuest').updateOne({ code: 'raider-toll' }, { $set: { rewards: [{ itemId: 'coin' }] } });
    await model('CyberiaQuest').updateOne({ code: 'night-watch' }, { $set: { rewards: [{ itemId: 'coin' }] } });
    await model('CyberiaAction').updateOne(
      { code: 'drift-stall' },
      { $set: { shopItems: [{ itemId: 'bullet', priceItemId: 'pistol' }] } },
    );

    const report = await syncSaga({ options, code: 'frontier', apply: true });
    expect(outcomes(report)).toMatchObject({
      'quest:raider-toll': 'failed',
      'quest:night-watch': 'failed',
      'action:drift-stall': 'assigned',
    });
    expect(detailOf(report, 'quest', 'raider-toll')).toBe('not placed; items that cannot run: coin (unbound)');
    expect(detailOf(report, 'quest', 'night-watch')).toBe('placed; items that cannot run: coin (unbound)');
    expect((await stored('CyberiaQuest', 'raider-toll')).sourceMapCode).toBeUndefined();
    expect((await stored('CyberiaAction', 'drift-stall')).sourceMapCode).toBe('outpost');
  });

  it('places the quest once the item it names runs', async () => {
    await model('CyberiaQuest').updateOne({ code: 'raider-toll' }, { $set: { rewards: [{ itemId: 'coin' }] } });
    await bindItemOf('coin');
    const report = await syncSaga({ options, code: 'frontier', apply: true });
    expect(outcomes(report)['quest:raider-toll']).toBe('assigned');
  });

  it('rejects a saga that is not stored with 404', async () => {
    await expect(syncSaga({ options, code: 'missing' })).rejects.toMatchObject({ status: 404 });
  });
});
