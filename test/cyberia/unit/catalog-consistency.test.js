import { describe, it, expect, vi } from 'vitest';

// The binding checks over stubbed collections: one item per problem, worlds read through a stub
// of the world load, and IPFS states the test names.
const world = vi.hoisted(() => ({ itemIds: new Set(), actionDocs: [], questDocs: [] }));
vi.mock('../../../src/projects/cyberia/instance-data.js', () => ({ loadWorld: async () => world }));
const ipfsStates = vi.hoisted(() => new Map());
vi.mock('../../../src/api/object-layer/object-layer.ipfs.js', () => ({
  objectLayerIpfsState: async ({ definition }) => ipfsStates.get(definition.cid) ?? [],
}));

const { bindingProblems, checkCatalogStorage, checkWorldBindings, findLegacyPins, repairLegacyPins } =
  await import('../../../src/projects/cyberia/catalog/catalog-consistency.js');

const lean = (value) => ({ lean: async () => value });
const catalog = (bindings) => ({
  resolve: async (itemIds) => new Map(itemIds.filter((id) => bindings[id]).map((id) => [id, bindings[id]])),
  find: () => lean(Object.entries(bindings).map(([itemId, objectLayerCid]) => ({ itemId, objectLayerCid }))),
});
const store = ({ bindings, definitions = [], atlases = [] }) => ({
  CyberiaItemCatalog: catalog(bindings),
  ObjectLayer: { find: ({ cid }) => lean(definitions.filter((definition) => cid.$in.includes(definition.cid))) },
  AtlasSpriteSheet: { distinct: async () => atlases },
});
const rendered = (cid, extra = {}) => ({ cid, origin: 'cache', data: { render: { cid: `${cid}-png` } }, ...extra });
const STORE = store({
  bindings: { coin: 'c', ghost: 'g', draft: 'd', relic: 'r', shard: 's', axe: 'x' },
  definitions: [
    rendered('c'),
    rendered('d', { origin: 'draft' }),
    rendered('r', { archivedAt: new Date() }),
    { cid: 's', origin: 'cache', data: {} },
    rendered('x'),
  ],
  atlases: ['c'],
});

describe('binding problems', () => {
  it('names what stops each item from running, and leaves out an item that runs', async () => {
    const problems = await bindingProblems(STORE, ['coin', 'ghost', 'draft', 'relic', 'shard', 'axe', 'none']);
    expect(Object.fromEntries([...problems].map(([itemId, { problem }]) => [itemId, problem]))).toEqual({
      ghost: 'missing',
      draft: 'draft',
      relic: 'archived',
      shard: 'unrendered',
      axe: 'no-atlas',
      none: 'unbound',
    });
  });
});

describe('a world checked before a game server loads it', () => {
  it('reports every item that cannot run as an error, an unrendered one as a warning, and every legacy pin', async () => {
    Object.assign(world, {
      itemIds: new Set(['coin', 'shard', 'none']),
      questDocs: [{ code: 'q1', rewards: [{ itemId: 'coin', objectLayerCid: 'old-c' }] }],
      actionDocs: [{ code: 'shop', shopItems: [{ itemId: 'coin', priceItemId: 'coin', priceObjectLayerCid: '' }] }],
    });
    const result = await checkWorldBindings({ ...STORE, CyberiaInstance: { distinct: async () => ['FOREST'] } });
    expect(result.ok).toBe(false);
    expect(result.worlds).toEqual([
      {
        instanceCode: 'FOREST',
        items: 3,
        findings: [
          { itemId: 'none', cid: '', problem: 'unbound', error: true },
          { itemId: 'shard', cid: 's', problem: 'unrendered', error: false },
          { itemId: 'coin', cid: 'old-c', problem: 'legacy-pin', error: true },
        ],
      },
    ]);
  });

  it('passes a world whose items all run, with warnings only', async () => {
    Object.assign(world, { itemIds: new Set(['coin', 'shard']), questDocs: [], actionDocs: [] });
    expect((await checkWorldBindings(STORE, { instanceCodes: ['FOREST'] })).ok).toBe(true);
  });
});

describe('legacy pins', () => {
  const raw = (docs) => {
    const updates = [];
    return {
      updates,
      collection: {
        find: () => ({ toArray: async () => docs }),
        updateOne: async (filter, update) => updates.push([filter, update]),
      },
    };
  };
  const pinned = () => ({
    CyberiaItemCatalog: catalog({ coin: 'c', axe: 'x' }),
    CyberiaQuest: raw([
      {
        _id: 'q1',
        code: 'q1',
        steps: [{ objectives: [{ itemId: 'axe', objectLayerCid: 'x' }] }],
        rewards: [{ itemId: 'coin', objectLayerCid: 'c' }],
      },
    ]),
    CyberiaAction: raw([
      {
        _id: 'a1',
        code: 'shop',
        shopItems: [{ itemId: 'axe', objectLayerCid: '', priceItemId: 'coin', priceObjectLayerCid: 'old-c' }],
      },
    ]),
  });

  it('finds the items pinned to several definitions, or to another one than the catalog binds', async () => {
    const { documents, conflicts } = await findLegacyPins(pinned());
    expect(documents.map(({ collection, code, pins }) => [collection, code, pins])).toEqual([
      [
        'CyberiaQuest',
        'q1',
        [
          { itemId: 'axe', cid: 'x' },
          { itemId: 'coin', cid: 'c' },
        ],
      ],
      ['CyberiaAction', 'shop', [{ itemId: 'coin', cid: 'old-c' }]],
    ]);
    expect(conflicts).toEqual([
      {
        itemId: 'coin',
        activeCid: 'c',
        cids: [
          { cid: 'c', documents: ['CyberiaQuest q1'] },
          { cid: 'old-c', documents: ['CyberiaAction shop'] },
        ],
      },
    ]);
  });

  it('reports without apply, and with apply removes every pin field, empty ones too', async () => {
    const models = pinned();
    const report = await repairLegacyPins(models);
    expect(report).toMatchObject({ applied: false, repaired: 0 });
    expect(models.CyberiaQuest.updates).toEqual([]);
    expect((await repairLegacyPins(models, { apply: true })).repaired).toBe(2);
    expect(models.CyberiaQuest.updates).toEqual([
      [{ _id: 'q1' }, { $unset: { 'steps.0.objectives.0.objectLayerCid': '', 'rewards.0.objectLayerCid': '' } }],
    ]);
    expect(models.CyberiaAction.updates).toEqual([
      [{ _id: 'a1' }, { $unset: { 'shopItems.0.objectLayerCid': '', 'shopItems.0.priceObjectLayerCid': '' } }],
    ]);
  });
});

describe('the storage of every binding', () => {
  it('reports each finding in its own category, once per definition however many items run it', async () => {
    const models = store({
      bindings: { coin: 'c', gold: 'c', relic: 'r' },
      definitions: [rendered('c'), rendered('r', { archivedAt: new Date() })],
      atlases: ['c'],
    });
    ipfsStates.set('c', [
      { name: 'object-layer.json', cid: 'c', registered: false, pinned: true, cluster: true, listedCid: 'c' },
      { name: 'atlas.png', cid: 'c-png', registered: true, pinned: false, cluster: null, listedCid: 'other' },
    ]);
    const { ok, findings } = await checkCatalogStorage(models);
    expect(ok).toBe(false);
    expect(findings).toEqual([
      { category: 'pin', itemIds: ['coin', 'gold'], cid: 'c', file: 'atlas.png', problem: 'unpinned' },
      { category: 'pin', itemIds: ['coin', 'gold'], cid: 'c', file: 'atlas.png', problem: 'cluster-unreachable' },
      { category: 'mfs', itemIds: ['coin', 'gold'], cid: 'c', file: 'atlas.png', problem: 'lists other' },
      { category: 'binding', itemIds: ['relic'], cid: 'r', file: '', problem: 'archived' },
    ]);
  });
});
