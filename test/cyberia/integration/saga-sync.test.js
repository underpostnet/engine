import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
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
  'quest:raider-toll': 'choose',
  'quest:night-watch': 'kept',
  'quest:haunt': 'omitted',
  'quest:lost-quest': 'failed',
  'action:drift-stall': 'choose',
  'action:hermit-hut': 'omitted',
  'dialogue:default-merchant': 'assigned',
  'dialogue:quest-talk-raider-toll': 'assigned',
  'dialogue:quest-talk-lost-quest': 'omitted',
  'dialogue:hermit-hello': 'failed',
  'skill:pistol': 'kept',
  'skill:wand': 'failed',
};
/** The merchant at (3, 4) of the outpost, as a moderator chooses it for a quest or an action. */
const merchantAt = (kind, code, mapRevision = 1) => ({
  kind,
  code,
  mapCode: 'outpost',
  cellX: 3,
  cellY: 4,
  mapRevision,
});
const MERCHANT_CHOICES = [merchantAt('quest', 'raider-toll'), merchantAt('action', 'drift-stall')];

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
    expect(report.counts).toEqual({ assigned: 2, kept: 2, choose: 2, conflict: 0, failed: 3, omitted: 3 });
    expect(detailOf(report, 'quest', 'raider-toll')).toBe('2 entities carry merchant: choose the provider');
    expect(report.entries.find(({ code }) => code === 'raider-toll').candidates).toEqual([
      { mapCode: 'outpost', cellX: 3, cellY: 4, mapRevision: 1 },
      { mapCode: 'outpost', cellX: 9, cellY: 9, mapRevision: 1 },
    ]);
    expect(detailOf(report, 'quest', 'night-watch')).toBe('guard at outpost (7, 2)');
    expect(detailOf(report, 'quest', 'haunt')).toBe('no entity of map outpost has ghost');
    expect(detailOf(report, 'action', 'hermit-hut')).toBe('map swamp is not stored');
    expect(detailOf(report, 'skill', 'wand')).toBe('items that cannot run: orb (unbound)');
    expect(report.reviewed).toMatchObject({ 'map:outpost': 1, 'quest:raider-toll': 1, 'action:drift-stall': 1 });
    expect((await stored('CyberiaQuest', 'raider-toll')).sourceMapCode).toBeUndefined();
    expect((await stored('CyberiaAction', 'drift-stall')).dialogCode).toBe('');
  });

  it('places nothing a moderator did not choose, then places each chosen provider in one write', async () => {
    const unchosen = await syncSaga({ options, code: 'frontier', apply: true });
    expect(outcomes(unchosen)['quest:raider-toll']).toBe('choose');
    expect((await stored('CyberiaQuest', 'raider-toll')).sourceMapCode).toBeUndefined();
    expect(await stored('CyberiaAction', 'drift-stall')).toMatchObject({ dialogCode: 'default-merchant', revision: 2 });

    const report = await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
    expect(outcomes(report)).toMatchObject({ 'quest:raider-toll': 'assigned', 'action:drift-stall': 'assigned' });
    expect(await stored('CyberiaQuest', 'raider-toll')).toMatchObject({
      sourceMapCode: 'outpost',
      sourceCellX: 3,
      sourceCellY: 4,
      revision: 2,
    });
    const stall = await stored('CyberiaAction', 'drift-stall');
    expect(stall).toMatchObject({ sourceMapCode: 'outpost', sourceCellX: 3, sourceCellY: 4, revision: 3 });
    expect(stall.questDialogueCodes.map(({ questCode, dialogCode }) => ({ questCode, dialogCode }))).toEqual([
      { questCode: 'raider-toll', dialogCode: 'quest-talk-raider-toll' },
    ]);
    const hut = await stored('CyberiaAction', 'hermit-hut');
    expect(hut.sourceMapCode).toBeUndefined();
    expect(hut.dialogCode).toBe('hermit-hello');
  });

  it('writes the placement and the dialogues of an action as one revision', async () => {
    await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
    expect(await stored('CyberiaAction', 'drift-stall')).toMatchObject({
      sourceMapCode: 'outpost',
      dialogCode: 'default-merchant',
      revision: 2,
    });
  });

  it('keeps on a second run what the first run assigned, without a choice and without a write', async () => {
    await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
    const before = await stored('CyberiaAction', 'drift-stall');
    const report = await syncSaga({ options, code: 'frontier', apply: true });
    expect(report.counts).toEqual({ assigned: 0, kept: 6, choose: 0, conflict: 0, failed: 3, omitted: 3 });
    expect((await stored('CyberiaAction', 'drift-stall')).revision).toBe(before.revision);
  });

  it('lists the cells of every stored map that carries the skin when the link names no map', async () => {
    await model('CyberiaMap').create({ code: 'checkpoint', entities: [entity('guard', 1, 2)] });
    const report = await syncSaga({ options, code: 'frontier' });
    const watch = report.entries.find(({ code }) => code === 'night-watch');
    expect(watch.outcome).toBe('kept');
    expect(watch.candidates.map(({ mapCode }) => mapCode)).toEqual(['outpost', 'checkpoint']);
    await model('CyberiaQuest').updateOne({ code: 'night-watch' }, { $unset: { sourceMapCode: 1 } });
    expect(outcomes(await syncSaga({ options, code: 'frontier' }))['quest:night-watch']).toBe('choose');
  });

  it('refuses a synchronization while another saga links a document to another provider', async () => {
    await model('CyberiaSaga').create({
      code: 'outlaws',
      name: 'Outlaws',
      questCodes: [{ providerSkinItemId: 'bandit', questCode: 'raider-toll', mapCode: 'outpost' }],
    });
    const report = await syncSaga({ options, code: 'frontier' });
    expect(report.entries.find(({ code }) => code === 'raider-toll')).toMatchObject({
      outcome: 'conflict',
      conflicts: [{ saga: 'outlaws', providerSkinItemId: 'bandit', mapCode: 'outpost' }],
    });
    await expect(
      syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect((await stored('CyberiaAction', 'drift-stall')).revision).toBe(1);
  });

  it('shares a document with a saga that links it to the same provider', async () => {
    await model('CyberiaSaga').create({
      code: 'caravan',
      name: 'Caravan',
      questCodes: [{ providerSkinItemId: 'merchant', questCode: 'raider-toll', mapCode: 'outpost' }],
    });
    const report = await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
    expect(outcomes(report)['quest:raider-toll']).toBe('assigned');
  });

  it('refuses a choice whose map changed, and an apply over a document edited after the check', async () => {
    await model('CyberiaMap').updateOne({ code: 'outpost' }, { $set: { revision: 2 } });
    await expect(
      syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES }),
    ).rejects.toMatchObject({
      status: 409,
    });
    const check = await syncSaga({ options, code: 'frontier' });
    await model('CyberiaAction').updateOne({ code: 'drift-stall' }, { $set: { label: 'Edited', revision: 2 } });
    const choices = [merchantAt('quest', 'raider-toll', 2), merchantAt('action', 'drift-stall', 2)];
    await expect(
      syncSaga({ options, code: 'frontier', apply: true, selections: choices, reviewed: check.reviewed }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('action:drift-stall') });
    expect(await stored('CyberiaAction', 'drift-stall')).toMatchObject({ label: 'Edited', revision: 2 });
    expect((await stored('CyberiaQuest', 'raider-toll')).sourceMapCode).toBeUndefined();
  });

  it('leaves a quest or an action where it is while an item it names cannot run', async () => {
    await model('CyberiaQuest').updateOne({ code: 'raider-toll' }, { $set: { rewards: [{ itemId: 'coin' }] } });
    await model('CyberiaQuest').updateOne({ code: 'night-watch' }, { $set: { rewards: [{ itemId: 'coin' }] } });
    await model('CyberiaAction').updateOne(
      { code: 'drift-stall' },
      { $set: { shopItems: [{ itemId: 'bullet', priceItemId: 'pistol' }] } },
    );

    const report = await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
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
    const report = await syncSaga({ options, code: 'frontier', apply: true, selections: MERCHANT_CHOICES });
    expect(outcomes(report)['quest:raider-toll']).toBe('assigned');
  });

  it('rejects a saga that is not stored with 404', async () => {
    await expect(syncSaga({ options, code: 'missing' })).rejects.toMatchObject({ status: 404 });
  });
});
