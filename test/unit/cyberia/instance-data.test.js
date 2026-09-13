import { describe, it, expect } from 'vitest';
import {
  buildCyberiaMmoInstanceEnv,
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

  it('carries an object layer with its ledger and render, defaulting the ledger to off-chain', () => {
    const msg = toObjectLayerMsg({ _id: 'o1', data: { item: { id: 'hatchet', type: 'weapon', activable: 1 } } });
    expect(msg).toMatchObject({
      mongoId: 'o1',
      item: { id: 'hatchet', type: 'weapon', description: '', activable: true },
      ledger: { type: 'OFF_CHAIN', address: '', tokenId: '' },
      render: { cid: '', metadataCid: '' },
      sha256: '',
      cid: '',
    });
    expect(toObjectLayerMsg({ _id: 'o2' }).item.id).toBe('');
  });

  it('carries vendor, craft and quest content with their defaults', () => {
    const action = toActionMsg({
      code: 'shop',
      shopItems: [{ itemId: 'hatchet' }],
      craftRecipes: [{ outputItems: [{ itemId: 'plank' }], ingredients: [{ itemId: 'wood-1', qty: 2 }] }],
      questDialogueCodes: [{ questCode: 'q1' }],
    });
    expect(action.shopItems[0]).toEqual({ itemId: 'hatchet', priceItemId: 'coin', priceQty: 1 });
    expect(action.craftRecipes[0]).toEqual({
      outputItems: [{ itemId: 'plank', qty: 1 }],
      ingredients: [{ itemId: 'wood-1', qty: 2 }],
      craftTimeMs: 0,
    });
    expect(action.questDialogueCodes[0]).toEqual({ questCode: 'q1', dialogCode: '' });
    expect(toActionMsg({})).toMatchObject({ code: '', storageSlots: 0, shopItems: [] });

    const quest = toQuestMsg({
      code: 'q1',
      steps: [{ id: 's1', objectives: [{ type: 'collect', itemId: 'wood-1' }] }],
      rewards: [{ itemId: 'coin' }],
    });
    expect(quest.steps[0].objectives[0]).toEqual({ type: 'collect', itemId: 'wood-1', quantity: 1 });
    expect(quest.rewards[0]).toEqual({ itemId: 'coin', quantity: 1 });
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
  const ol = (id, type = 'skin') => ({ _id: `ol-${id}`, sha256: `sha-${id}`, data: { item: { id, type } } });

  it('answers a ping with the server clock', () => {
    expect(pingData().serverTimeMs).toBeGreaterThan(0);
  });

  it('filters object layers by item type only when one is asked for', async () => {
    expect(objectLayerQueryFilter('')).toEqual({});
    expect(objectLayerQueryFilter('skin')).toEqual({ 'data.item.type': 'skin' });
    const filters = [];
    const models = { ObjectLayer: { find: (filter) => (filters.push(filter), lean([ol('anon')])) } };
    const batch = await fetchObjectLayerBatch(models, 'skin');
    expect(filters).toEqual([{ 'data.item.type': 'skin' }]);
    expect(batch.map(({ item }) => item.id)).toEqual(['anon']);
  });

  it('resolves one object layer by item id, or null', async () => {
    const models = { ObjectLayer: { findOne: ({ 'data.item.id': id }) => lean(id === 'anon' ? ol('anon') : null) } };
    expect((await fetchObjectLayer(models, 'anon')).mongoId).toBe('ol-anon');
    expect(await fetchObjectLayer(models, 'ghost')).toBeNull();
  });

  it('lists the id and digest of every object layer', async () => {
    const models = { ObjectLayer: { find: () => lean([ol('anon'), { _id: 'x' }]) } };
    expect(await fetchObjectLayerManifest(models)).toEqual({
      entries: [
        { itemId: 'anon', sha256: 'sha-anon' },
        { itemId: '', sha256: '' },
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
  const ol = (id, type = 'skin') => ({ _id: `ol-${id}`, sha256: `sha-${id}`, data: { item: { id, type } } });

  it('serves the procedural world, with the canonical content, when the instance is unknown', async () => {
    const queries = [];
    const models = {
      CyberiaInstance: { findOne: () => lean(null) },
      ObjectLayer: { find: (filter) => (queries.push(filter), lean([ol('anon'), ol(DEFAULT_DEAD_ITEM_ID)])) },
    };
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
    const wanted = queries[0]['data.item.id'].$in;
    expect(wanted).toContain('anon');
    expect(wanted).toContain(DEFAULT_DEAD_ITEM_ID);

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
      ObjectLayer: {
        find: ({ 'data.item.id': { $in } }) =>
          lean(
            ['atlas_pistol_mk2', 'hatchet', 'atlas_pistol_mk2_bullet']
              .filter((id) => $in.includes(id))
              .map((id) => ol(id)),
          ),
      },
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

  it('runs a world whose conf reference is gone on the canonical defaults', async () => {
    const models = {
      CyberiaInstance: { findOne: () => lean({ _id: 'i1', code: 'BARE', cyberiaMapCodes: [], conf: null }) },
      CyberiaInstanceConf: { findOne: () => lean(null) },
      CyberiaEntityTypeDefault: { find: () => lean([]) },
      ObjectLayer: { find: () => lean([]) },
    };
    const world = await fetchFullInstance(models, 'BARE');
    expect(world.config.tickRate).toBe(CYBERIA_INSTANCE_CONF_DEFAULTS.tickRate);
    expect(world.maps).toEqual([]);
    expect(world.actions).toEqual([]);
    expect(world.quests).toEqual([]);
    expect(world.objectLayers).toEqual([]);
  });
});
