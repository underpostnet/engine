import { describe, it, expect } from 'vitest';
import {
  buildCyberiaMmoInstanceEnv,
  toObjectLayerMsgs,
  getInstanceModels,
  parseRgba,
  toEntityMsg,
  toMapMsg,
  toInstanceMsg,
  toObjectLayerMsg,
  toActionMsg,
  toQuestMsg,
  toInstanceConfig,
  buildFallbackConfig,
  pingData,
  objectLayerQueryFilter,
  fetchObjectLayerBatch,
  fetchObjectLayer,
  fetchMapData,
  fetchObjectLayerManifest,
  fetchFullInstance,
  skillDocsToConfig,
  entityTypeDefaultDocsToConfig,
  mergeEntityDefaults,
  itemTypesOf,
} from '../../../src/projects/cyberia/instance-data.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  DEFAULT_DEAD_ITEM_ID,
  ENTITY_TYPE_DEFAULTS,
} from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

const lean = (value) => ({ lean: async () => value, populate: () => lean(value) });

// A store of definitions, each bound in the item catalog under its label.
const catalog = (definitions = [], onFind = () => {}) => {
  const byCid = new Map(definitions.map((d) => [d.cid, d]));
  const bindings = new Map(definitions.map((d) => [d.data.item.id, d.cid]));
  return {
    ObjectLayer: {
      find: (filter, projection) => {
        onFind(filter, projection);
        return lean(
          [...byCid.values()].filter(
            (d) =>
              filter.cid.$in.includes(d.cid) &&
              (!filter['data.item.type'] || d.data.item.type === filter['data.item.type']),
          ),
        );
      },
      findByCid: async (cid) => byCid.get(cid) ?? null,
      distinct: async (field, filter) => filter.cid.$in.filter((cid) => byCid.has(cid)),
    },
    CyberiaItemCatalog: {
      resolve: async (ids) => new Map(ids.filter((id) => bindings.has(id)).map((id) => [id, bindings.get(id)])),
      distinct: async () => [...bindings.values()],
      find: () => lean([...bindings].map(([itemId, objectLayerCid]) => ({ itemId, objectLayerCid }))),
      findOne: ({ itemId }) => lean(bindings.has(itemId) ? { objectLayerCid: bindings.get(itemId) } : null),
    },
  };
};

describe('instance env', () => {
  it('derives the server and client variables from the variant runtime', () => {
    const server = buildCyberiaMmoInstanceEnv({
      instance: { runtime: 'cyberia-server', path: '/forest', instanceCode: 'FOREST' },
      env: { PORT: '4001' },
    });
    expect(server).toEqual({ PORT: '4001', INSTANCE_CODE: 'FOREST', CYBERIA_BASE_PATH: '/forest' });

    const client = buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-client', path: '/' } });
    expect(client).toEqual({
      CYBERIA_INSTANCE_CODE: DEFAULT_INSTANCE_CODE,
      CYBERIA_DEFAULT_INSTANCE: DEFAULT_INSTANCE_CODE,
      CYBERIA_BASE_PATH: '/',
    });
  });

  it('leaves a runtime it does not know alone', () => {
    expect(buildCyberiaMmoInstanceEnv({ instance: { runtime: 'nodejs', path: '/x' }, env: { A: '1' } })).toEqual({
      A: '1',
    });
    expect(buildCyberiaMmoInstanceEnv({})).toEqual({});
  });

  it('names the context when no database provider was loaded for it', () => {
    expect(() => getInstanceModels({ host: 'nowhere.test', path: '/' })).toThrow('nowhere.test');
  });
});

describe('wire converters', () => {
  it('parses css colours into wire components and treats anything else as transparent', () => {
    expect(parseRgba('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 128 });
    expect(parseRgba('rgb(1,2,3)')).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    expect(parseRgba('')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseRgba('#ff0000')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('fills every entity, map and instance field an empty document leaves out', () => {
    const entity = toEntityMsg({});
    expect(entity).toMatchObject({ entityType: 'floor', level: 0, dimX: 1, dimY: 1, objectLayerItemIds: [] });
    expect(toEntityMsg({ level: 3, color: 'rgb(9,8,7)' })).toMatchObject({ level: 3, colorR: 9, colorB: 7 });

    const map = toMapMsg({ _id: 'm1', entities: [{ entityType: 'bot' }] });
    expect(map).toMatchObject({ mongoId: 'm1', gridX: 16, cellWidth: 32 });
    expect(map.entities[0].entityType).toBe('bot');

    const instance = toInstanceMsg({ _id: 'i1', portals: [{ sourceMapCode: 'a' }] });
    expect(instance).toMatchObject({ mongoId: 'i1', topologyMode: 'hybrid', mapCodes: [] });
    expect(instance.portals[0]).toMatchObject({ sourceMapCode: 'a', portalMode: 'inter-portal', targetCellX: 0 });
    expect(instance.playerSpawn).toEqual({ sourceMapCode: '', sourceCellX: 0, sourceCellY: 0, random: false });
  });

  it('carries an object layer with its cid as the one identity, its render, and no ledger state', () => {
    const msg = toObjectLayerMsg({
      _id: 'o1',
      contentHash: 'a'.repeat(64),
      profile: { id: 'cyberia', version: 2 },
      cid: 'bafkrei-o1',
      data: { item: { id: 'hatchet', type: 'weapon', activable: 1 } },
    });
    expect(msg).toMatchObject({
      item: { id: 'hatchet', type: 'weapon', description: '', activable: true },
      ledger: { standard: '', chainId: 0, contractAddress: '', tokenId: '' },
      render: { cid: '', metadataCid: '' },
      cid: 'bafkrei-o1',
    });
    for (const local of ['mongoId', 'contentHash', 'profile']) expect(msg).not.toHaveProperty(local);
    expect(toObjectLayerMsg({ _id: 'o2' }).item.id).toBe('');
  });

  it('projects the ItemLedger binding of a definition onto the wire ledger', async () => {
    const doc = { _id: 'o1', cid: 'bafkrei-o1', data: { item: { id: 'hatchet', type: 'weapon' } } };
    const binding = {
      objectLayerCid: 'bafkrei-o1',
      standard: 'ERC1155',
      contractAddress: '0xabc',
      tokenId: '42',
      chainId: 1,
    };
    expect(toObjectLayerMsg(doc, binding).ledger).toEqual({
      standard: 'ERC1155',
      chainId: 1,
      contractAddress: '0xabc',
      tokenId: '42',
    });

    const queries = [];
    const models = {
      ItemLedger: { find: (q) => ({ sort: () => ({ lean: async () => (queries.push(q), [binding]) }) }) },
    };
    const [msg] = await toObjectLayerMsgs(models, [doc, { _id: 'o2', cid: 'bafkrei-o2', data: {} }]);
    expect(queries[0]).toEqual({ objectLayerCid: { $in: ['bafkrei-o1', 'bafkrei-o2'] } });
    expect(msg.ledger.tokenId).toBe('42');
    // A deployment without the ItemLedger API serves every definition as unregistered.
    expect((await toObjectLayerMsgs({}, [doc]))[0].ledger.standard).toBe('');
  });

  it('carries vendor, craft and quest content with their defaults', () => {
    const action = toActionMsg({
      code: 'shop',
      shopItems: [{ itemId: 'hatchet', objectLayerCid: 'cid-hatchet' }],
      craftRecipes: [{ outputItems: [{ itemId: 'plank' }], ingredients: [{ itemId: 'wood-1', qty: 2 }] }],
      questDialogueCodes: [{ questCode: 'q1' }],
    });
    // The label is what the runtime displays; the pinned cid is the definition it means.
    expect(action.shopItems[0]).toEqual({
      itemId: 'hatchet',
      objectLayerCid: 'cid-hatchet',
      priceItemId: 'coin',
      priceObjectLayerCid: '',
      priceQty: 1,
    });
    expect(action.craftRecipes[0]).toEqual({
      outputItems: [{ itemId: 'plank', objectLayerCid: '', qty: 1 }],
      ingredients: [{ itemId: 'wood-1', objectLayerCid: '', qty: 2 }],
      craftTimeMs: 0,
    });
    expect(action.questDialogueCodes[0]).toEqual({ questCode: 'q1', dialogCode: '' });
    expect(toActionMsg({})).toMatchObject({ code: '', storageSlots: 0, shopItems: [] });

    const quest = toQuestMsg({
      code: 'q1',
      steps: [{ id: 's1', objectives: [{ type: 'collect', itemId: 'wood-1', objectLayerCid: 'cid-wood' }] }],
      rewards: [{ itemId: 'coin' }],
    });
    expect(quest.steps[0].objectives[0]).toEqual({
      type: 'collect',
      itemId: 'wood-1',
      objectLayerCid: 'cid-wood',
      quantity: 1,
    });
    expect(quest.rewards[0]).toEqual({ itemId: 'coin', objectLayerCid: '', quantity: 1 });
    expect(toQuestMsg({})).toMatchObject({ code: '', steps: [], unlocksQuestCodes: [] });
  });
});

describe('instance config', () => {
  it('is the canonical defaults for a world without a conf', () => {
    expect(toInstanceConfig(null)).toEqual(buildFallbackConfig());
    expect(buildFallbackConfig()).toEqual(CYBERIA_INSTANCE_CONF_DEFAULTS);
    expect(buildFallbackConfig()).not.toBe(CYBERIA_INSTANCE_CONF_DEFAULTS);
  });

  it('keeps every field a conf sets and fills the rest from the defaults', () => {
    const config = toInstanceConfig({
      tickRate: 5,
      economyRules: { portalFee: 9 },
      skillRules: { projectileWidth: 3, doppelgangerSpawnChance: 0.2 },
      equipmentRules: { requireSkin: false },
      lifeRegenChance: 7,
    });
    const fb = CYBERIA_INSTANCE_CONF_DEFAULTS;
    expect(config.tickRate).toBe(5);
    expect(config.snapshotRate).toBe(fb.snapshotRate);
    expect(config.economyRules).toEqual({ ...fb.economyRules, portalFee: 9 });
    expect(config.skillRules).toEqual({ ...fb.skillRules, projectileWidth: 3, doppelgangerSpawnChance: 0.2 });
    expect(config.equipmentRules).toEqual({ ...fb.equipmentRules, requireSkin: false });
    expect(config.lifeRegenChance).toBe(fb.lifeRegenChance);
    expect(config.skillConfig).toEqual([]);
    expect(config.entityDefaults.map(({ entityType }) => entityType)).toEqual(
      ENTITY_TYPE_DEFAULTS.map(({ entityType }) => entityType),
    );
  });

  it('shapes skill and entity-type documents for the wire and drops the ones without a key', () => {
    expect(skillDocsToConfig([{ triggerItemId: 'gun', skills: [{ logicEventId: 'projectile' }] }, {}, null])).toEqual([
      {
        triggerItemId: 'gun',
        skills: [{ logicEventId: 'projectile', name: '', description: '', summonedEntityItemId: '' }],
      },
    ]);
    expect(
      entityTypeDefaultDocsToConfig([{ entityType: 'bot', liveItemIds: ['x'] }, { liveItemIds: ['y'] }]),
    ).toMatchObject([{ entityType: 'bot', liveItemIds: ['x'], deadItemIds: [] }]);
  });

  it('completes a partial set of entity defaults with the canonical types it does not cover', () => {
    const merged = mergeEntityDefaults([{ entityType: 'bot', liveItemIds: ['ghost'] }], { ghost: 'skin' });
    const bots = merged.filter(({ entityType }) => entityType === 'bot');
    expect(bots).toHaveLength(1);
    expect(bots[0].liveItemIds).toEqual(['ghost']);
    expect(merged.some(({ entityType }) => entityType === 'player')).toBe(true);
    expect(itemTypesOf([{ data: { item: { id: 'ghost', type: 'skin' } } }, { data: {} }, null])).toEqual({
      ghost: 'skin',
    });
  });
});

describe('transport-agnostic fetchers', () => {
  const ol = (id, type = 'skin') => ({
    _id: `ol-${id}`,
    cid: `cid-${id}`,
    contentHash: `sha-${id}`,
    data: { item: { id, type } },
  });

  it('answers a ping with the server clock', () => {
    expect(pingData().serverTimeMs).toBeGreaterThan(0);
  });

  it('streams the bound definitions, filtered by item type only when one is asked for', async () => {
    expect(objectLayerQueryFilter('')).toEqual({});
    expect(objectLayerQueryFilter('skin')).toEqual({ 'data.item.type': 'skin' });
    const filters = [];
    const models = catalog([ol('anon'), ol('hatchet', 'weapon')], (filter) => filters.push(filter));
    const batch = await fetchObjectLayerBatch(models, 'skin');
    expect(filters[0]).toEqual({
      'data.item.type': 'skin',
      origin: { $ne: 'draft' },
      cid: { $in: ['cid-anon', 'cid-hatchet'] },
    });
    expect(batch.map(({ item }) => item.id)).toEqual(['anon']);
    expect((await fetchObjectLayerBatch(models, '')).map(({ cid }) => cid)).toEqual(['cid-anon', 'cid-hatchet']);
  });

  it('resolves a label through the catalog, or null when unbound', async () => {
    const models = catalog([ol('anon')]);
    expect((await fetchObjectLayer(models, 'anon')).cid).toBe('cid-anon');
    expect(await fetchObjectLayer(models, 'ghost')).toBeNull();
  });

  it('lists every bound label with the cid of its definition', async () => {
    const models = catalog([ol('anon'), ol('hatchet', 'weapon')]);
    expect(await fetchObjectLayerManifest(models)).toEqual({
      entries: [
        { itemId: 'anon', cid: 'cid-anon' },
        { itemId: 'hatchet', cid: 'cid-hatchet' },
      ],
    });
  });

  it('serves a map and records which instance serves it, surviving a registry failure', async () => {
    const registry = [];
    const models = {
      CyberiaMap: { findOne: ({ code }) => lean(code === 'forest-1' ? { _id: 'm1', code } : null) },
      GlobalMapCodeRegistry: {
        findOneAndUpdate: (filter, update) => {
          registry.push({ filter, update });
          return Promise.reject(new Error('registry down'));
        },
      },
    };
    expect(await fetchMapData(models, { mapCode: 'ghost' })).toBeNull();
    expect(await fetchMapData(models, { mapCode: 'forest-1' })).toMatchObject({ map: { code: 'forest-1' } });
    expect(registry).toEqual([]);
    const served = await fetchMapData(models, { mapCode: 'forest-1', instanceCode: 'FOREST' });
    expect(served.map.mongoId).toBe('m1');
    expect(registry).toEqual([
      { filter: { mapCode: 'forest-1' }, update: { instanceCode: 'FOREST', status: 'active' } },
    ]);
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('full world load', () => {
  const ol = (id, type = 'skin') => ({
    _id: `ol-${id}`,
    cid: `cid-${id}`,
    contentHash: `sha-${id}`,
    data: { item: { id, type } },
  });

  it('serves the procedural world, with the canonical content, when the instance is unknown', async () => {
    const resolved = [];
    const store = catalog([ol('anon'), ol(DEFAULT_DEAD_ITEM_ID)]);
    const resolve = store.CyberiaItemCatalog.resolve;
    store.CyberiaItemCatalog.resolve = (ids) => (resolved.push(ids), resolve(ids));
    const models = { CyberiaInstance: { findOne: () => lean(null) }, ...store };
    const world = await fetchFullInstance(models, '');
    expect(world.instance.seed).toBe('default');
    expect(world.maps.length).toBeGreaterThan(0);
    expect(world.maps[0].entities[0]).toHaveProperty('colorA');
    expect(world.objectLayers.map(({ item }) => item.id)).toEqual(['anon', DEFAULT_DEAD_ITEM_ID]);
    expect(world.config.skillConfig.map(({ triggerItemId }) => triggerItemId)).toContain('atlas_pistol_mk2');
    expect(world.actions.length).toBeGreaterThan(0);
    expect(world.quests.length).toBeGreaterThan(0);
    expect(world.version).toMatch(/^fallback-[0-9a-f]{64}$/);
    // Every canonical item is asked for, so anything a player can pick up resolves an atlas.
    expect(resolved[0]).toContain('anon');
    expect(resolved[0]).toContain(DEFAULT_DEAD_ITEM_ID);

    const again = await fetchFullInstance(models, '');
    expect(again.version).toBe(world.version);
  });

  it('loads a stored world from its conf, maps, content and the skills its items trigger', async () => {
    const conf = { _id: 'c1', instanceCode: 'FOREST', tickRate: 7, entityTypeDefaults: [], updatedAt: 't1' };
    const models = {
      CyberiaInstance: {
        findOne: () => lean({ _id: 'i1', code: 'FOREST', cyberiaMapCodes: ['forest-1'], conf, updatedAt: 't0' }),
      },
      CyberiaMap: {
        find: () => lean([{ _id: 'm1', code: 'forest-1', entities: [{ objectLayerItemIds: ['atlas_pistol_mk2'] }] }]),
      },
      CyberiaEntityTypeDefault: { find: () => lean([]) },
      CyberiaAction: {
        find: () => lean([{ code: 'shop', sourceMapCode: 'forest-1', shopItems: [{ itemId: 'hatchet' }] }]),
      },
      CyberiaQuest: { find: () => lean([{ code: 'q1', sourceMapCode: 'forest-1' }]) },
      CyberiaSkill: { find: () => lean([]) },
      ...catalog(['atlas_pistol_mk2', 'hatchet', 'atlas_pistol_mk2_bullet'].map((id) => ol(id))),
    };
    const world = await fetchFullInstance(models, 'FOREST');
    expect(world.instance.code).toBe('FOREST');
    expect(world.config.tickRate).toBe(7);
    // The map places the pistol and the vendor sells the hatchet: both trigger skills this world runs.
    const triggers = world.config.skillConfig.map(({ triggerItemId }) => triggerItemId);
    expect(triggers).toContain('atlas_pistol_mk2');
    expect(triggers).toContain('hatchet');
    // What the skill summons needs an atlas too.
    expect(world.objectLayers.map(({ item }) => item.id)).toContain('atlas_pistol_mk2_bullet');
    expect(world.objectLayers.map(({ item }) => item.id)).toContain('hatchet');
    expect(world.actions[0].shopItems[0].itemId).toBe('hatchet');
    expect(world.quests[0].code).toBe('q1');
    expect(world.version).toMatch(/^[0-9a-f]{64}$/);
  });

  // A quest names the definition it means; rebinding the label never moves it.
  it('loads the definition a quest pins, not the one the catalog binds the label to', async () => {
    const store = catalog([ol('hatchet', 'weapon')]);
    const pinned = { ...ol('hatchet', 'weapon'), _id: 'ol-hatchet-pinned', cid: 'cid-hatchet-pinned' };
    const find = store.ObjectLayer.find;
    store.ObjectLayer.find = (filter, projection) =>
      lean(filter.cid.$in.includes(pinned.cid) ? [pinned] : (find(filter, projection).leanValue ?? []));
    const models = {
      CyberiaInstance: {
        findOne: () => lean({ _id: 'i1', code: 'FOREST', cyberiaMapCodes: ['forest-1'], conf: { _id: 'c1' } }),
      },
      CyberiaMap: {
        find: () => lean([{ _id: 'm1', code: 'forest-1', entities: [{ objectLayerItemIds: ['hatchet'] }] }]),
      },
      CyberiaEntityTypeDefault: { find: () => lean([]) },
      CyberiaAction: { find: () => lean([]) },
      CyberiaQuest: {
        find: () =>
          lean([
            {
              code: 'q1',
              sourceMapCode: 'forest-1',
              rewards: [{ itemId: 'hatchet', objectLayerCid: pinned.cid, quantity: 1 }],
            },
          ]),
      },
      CyberiaSkill: { find: () => lean([]) },
      ...store,
    };
    const world = await fetchFullInstance(models, 'FOREST');
    expect(world.objectLayers.map(({ cid }) => cid)).toContain(pinned.cid);
    expect(world.quests[0].rewards[0].objectLayerCid).toBe(pinned.cid);
  });

  it('refuses a world whose content pins one label to two definitions', async () => {
    const models = {
      CyberiaInstance: {
        findOne: () => lean({ _id: 'i1', code: 'FOREST', cyberiaMapCodes: ['forest-1'], conf: { _id: 'c1' } }),
      },
      CyberiaMap: {
        find: () => lean([{ _id: 'm1', code: 'forest-1', entities: [{ objectLayerItemIds: ['hatchet'] }] }]),
      },
      CyberiaEntityTypeDefault: { find: () => lean([]) },
      CyberiaAction: { find: () => lean([]) },
      CyberiaQuest: {
        find: () =>
          lean([
            { code: 'q1', sourceMapCode: 'forest-1', rewards: [{ itemId: 'hatchet', objectLayerCid: 'cid-a' }] },
            { code: 'q2', sourceMapCode: 'forest-1', rewards: [{ itemId: 'hatchet', objectLayerCid: 'cid-b' }] },
          ]),
      },
      CyberiaSkill: { find: () => lean([]) },
      ...catalog([ol('hatchet', 'weapon')]),
    };
    await expect(fetchFullInstance(models, 'FOREST')).rejects.toThrow(/pins several definitions/);
  });

  it('runs a world whose conf reference is gone on the canonical defaults', async () => {
    const models = {
      CyberiaInstance: { findOne: () => lean({ _id: 'i1', code: 'BARE', cyberiaMapCodes: [], conf: null }) },
      CyberiaInstanceConf: { findOne: () => lean(null) },
      CyberiaEntityTypeDefault: { find: () => lean([]) },
      ...catalog([]),
    };
    const world = await fetchFullInstance(models, 'BARE');
    expect(world.config.tickRate).toBe(CYBERIA_INSTANCE_CONF_DEFAULTS.tickRate);
    expect(world.maps).toEqual([]);
    expect(world.actions).toEqual([]);
    expect(world.quests).toEqual([]);
    expect(world.objectLayers).toEqual([]);
  });
});
