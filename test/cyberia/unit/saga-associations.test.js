import { describe, it, expect, vi } from 'vitest';

// A context index in which one saga defines a map and an item; the rest is the foundation's.
const INDEX = vi.hoisted(() => ({
  definitions: { 'map.glade': {}, 'map.cave': {}, 'floor.grass': {}, 'prop.lamp': {} },
  sources: {
    'map.glade': 'foundation',
    'map.cave': 'ash-signal',
    'floor.grass': 'foundation',
    'prop.lamp': 'ash-signal',
  },
  labels: { grass: 'floor.grass', lamp: 'prop.lamp' },
}));
const stored = vi.hoisted(() => ({
  maps: [],
  sagas: [],
  skills: [],
  instances: [],
  confs: [],
  entityDefaults: [],
}));
vi.mock('../../../src/projects/cyberia/content-artifact.js', () => ({ contentArtifact: () => ({ context: INDEX }) }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) => ({
      find: () => ({
        lean: async () =>
          ({
            CyberiaMap: stored.maps,
            CyberiaSaga: stored.sagas,
            CyberiaSkill: stored.skills,
            CyberiaInstance: stored.instances,
            CyberiaInstanceConf: stored.confs,
            CyberiaEntityTypeDefault: stored.entityDefaults,
          })[name],
      }),
    }),
  },
}));

const { keysOfSagas, loadSagaAssociations, sagaAssociations, withSagaFilter } =
  await import('../../../src/projects/cyberia/saga-associations.js');

const map = (code, ...itemIds) => ({ code, entities: itemIds.map((id) => ({ objectLayerItemIds: [id] })) });

describe('saga associations', () => {
  it('holds what a saga defines, the maps a stored saga lists, and every item a saga map carries', () => {
    const associations = sagaAssociations({
      maps: [map('cave', 'grass', 'crystal'), map('glade', 'grass', 'moss'), map('ruin', 'lamp')],
      sagas: [
        { code: 'ash-signal', mapCodes: ['cave'] },
        { code: 'bloom', mapCodes: ['cave', 'ruin'] },
      ],
    });
    expect(associations.maps).toEqual({ cave: ['ash-signal', 'bloom'], ruin: ['bloom'] });
    expect(associations.items).toEqual({
      lamp: ['ash-signal', 'bloom'],
      grass: ['ash-signal', 'bloom'],
      crystal: ['ash-signal', 'bloom'],
    });
    expect(associations.items.moss).toBeUndefined();
  });

  it('gives every item the entity-type defaults of an instance wire the sagas of its maps', async () => {
    Object.assign(stored, {
      maps: [],
      sagas: [{ code: 'bloom', mapCodes: ['ruin'] }],
      skills: [{ triggerItemId: 'blade', skills: [{ summonedEntityItemId: 'slash' }] }],
      instances: [
        { cyberiaMapCodes: ['ruin', 'glade'], conf: 'conf-1' },
        { cyberiaMapCodes: ['glade'], conf: 'conf-2' },
      ],
      confs: [
        { _id: 'conf-1', entityDefaults: ['bot', 'missing'] },
        { _id: 'conf-2', entityDefaults: ['tree'] },
      ],
      entityDefaults: [
        {
          _id: 'bot',
          liveItemIds: ['raider', 'blade'],
          deadItemIds: ['ghost'],
          dropItemIds: ['coin'],
          inventoryItemsIds: ['$slot', 'charm'],
        },
        { _id: 'tree', liveItemIds: ['oak'], deadItemIds: [], dropItemIds: ['log'], inventoryItemsIds: [] },
      ],
    });
    const { items } = await loadSagaAssociations({});
    for (const itemId of ['raider', 'blade', 'ghost', 'coin', 'charm', 'slash'])
      expect(items[itemId], itemId).toEqual(['bloom']);
    for (const itemId of ['$slot', 'oak', 'log']) expect(items, itemId).not.toHaveProperty(itemId);
  });

  it('gives an item summoned by a skill every saga of the item that triggers it, along a chain', () => {
    const associations = sagaAssociations({
      maps: [map('ruin', 'pistol')],
      sagas: [{ code: 'bloom', mapCodes: ['ruin'] }],
      skills: [
        { triggerItemId: 'pistol', skills: [{ summonedEntityItemId: 'bullet' }, { summonedEntityItemId: '' }] },
        { triggerItemId: 'bullet', skills: [{ summonedEntityItemId: 'spark' }] },
        { triggerItemId: 'wand', skills: [{ summonedEntityItemId: 'orb' }] },
      ],
    });
    expect(associations.items.pistol).toEqual(['bloom']);
    expect(associations.items.bullet).toEqual(['bloom']);
    expect(associations.items.spark).toEqual(['bloom']);
    expect(associations.items).not.toHaveProperty('orb');
  });
  it('selects the keys of the sagas comma-separated terms name, by part of the code, ignoring case', () => {
    const bucket = { cave: ['ash-signal', 'bloom'], ruin: ['bloom'], glade: [] };
    expect(keysOfSagas(bucket, 'ASH')).toEqual(['cave']);
    expect(keysOfSagas(bucket, ' ash-signal , bloom ')).toEqual(['cave', 'ruin']);
    expect(keysOfSagas(bucket, 'none')).toEqual([]);
  });
});

describe('a table request filtered by saga', () => {
  const request = (filterModel) => ({ page: '1', filterModel: JSON.stringify(filterModel) });

  it('moves the saga filter onto the stored field, joined to the filter the field has', async () => {
    stored.maps = [map('cave', 'crystal')];
    stored.sagas = [];
    const saga = { filterType: 'text', type: 'sagas', filter: 'ash' };
    const alone = await withSagaFilter(request({ sagaCode: saga }), { family: 'maps', field: 'code' }, {});
    expect(JSON.parse(alone.filterModel)).toEqual({ code: { filterType: 'set', values: ['cave'] } });
    expect(alone.page).toBe('1');

    const label = { filterType: 'text', type: 'contains', filter: 'cr' };
    const joined = await withSagaFilter(
      request({ sagaCode: saga, 'data.item.id': label }),
      { family: 'items', field: 'data.item.id' },
      {},
    );
    expect(JSON.parse(joined.filterModel)).toEqual({
      'data.item.id': {
        filterType: 'multi',
        operator: 'AND',
        filterModels: [label, { filterType: 'set', values: ['lamp', 'crystal'] }],
      },
    });
  });

  it('leaves a request without a saga filter as it came', async () => {
    const params = request({ code: { filterType: 'text', type: 'contains', filter: 'c' } });
    expect(await withSagaFilter(params, { family: 'maps', field: 'code' }, {})).toBe(params);
  });
});
