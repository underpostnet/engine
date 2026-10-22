import { describe, expect, it } from 'vitest';
import { instanceMapLayout, mapRects, mapsTouch } from '../../../src/projects/cyberia/instance/instance-map-layout.js';
import { buildStaticPayload } from '../../../src/api/cyberia-instance/cyberia-instance-map.service.js';
import { resolveProgressionRules } from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { worldPreviewGeometry } from '../../../src/projects/cyberia/instance/world-preview.js';

const map = (code, gridX = 16, gridY = 16) => ({ code, gridX, gridY });
// The spawn rules of a world: its entity-type defaults over the default progression and layer cap.
const rules = (entityDefaults = [], conf = {}) => ({
  entityDefaults,
  progressionRules: resolveProgressionRules(conf.progressionRules || {}),
  maxActiveLayers: conf.maxActiveLayers ?? 4,
});
const at = (x, y) => ({ x, y });
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const noOverlap = (rects) => {
  for (const [i, a] of rects.entries())
    for (const b of rects.slice(i + 1))
      expect(
        Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
          Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top),
      ).toBe(true);
};

describe('map geometry', () => {
  it('joins equal maps on neighbour cells on all four sides', () => {
    const cells = [at(0, 0), at(-1, 0), at(0, -1), at(1, 0), at(0, 1)];
    const rects = mapRects(
      cells.map((_, i) => map(`m${i}`, 32, 16)),
      cells,
    );
    for (const other of rects.slice(1)) expect(mapsTouch(rects[0], other)).toBe(true);
    expect(rects[0]).toEqual(rect(32, 16, 64, 32));
    noOverlap(rects);
  });

  it('joins maps of different sizes along a whole or a partial edge', () => {
    const rects = mapRects(
      [map('wide', 32, 16), map('square'), map('big', 32, 32), map('small')],
      [at(0, 0), at(1, 0), at(0, 1), at(1, 1)],
    );
    const [wide, square, big, small] = rects;
    expect(wide.right).toBe(square.left);
    expect([wide.top, wide.bottom]).toEqual([square.top, square.bottom]);
    expect(mapsTouch(wide, square)).toBe(true);
    // The small map takes half of the right side of the big map.
    expect(small).toEqual(rect(32, 16, 48, 32));
    expect(mapsTouch(big, small)).toBe(true);
    expect(mapsTouch(wide, big)).toBe(true);
    noOverlap(rects);
  });

  it('completes a surface with a map as wide as the two maps above it', () => {
    // The authored layout of the `test` world.
    const rects = mapRects(
      [map('test-a', 64, 64), map('test-b', 64, 64), map('map-test-b', 128, 50)],
      [at(0, 0), at(1, 0), at(0, 1)],
    );
    expect(rects).toEqual([rect(0, 0, 64, 64), rect(64, 0, 128, 64), rect(0, 64, 128, 114)]);
    expect(mapsTouch(rects[0], rects[1]) && mapsTouch(rects[0], rects[2]) && mapsTouch(rects[1], rects[2])).toBe(true);
  });

  it('keeps the rows and the empty column of an authored world', () => {
    // The authored layout of the `amethyst-strata-expansion` world.
    const maps = [
      map('foliage', 64, 64),
      map('athel', 64, 64),
      map('sap', 64, 64),
      map('verdant', 64, 64),
      map('map-test', 128, 50),
    ];
    const [foliage, athel, sap, verdant, mapTest] = mapRects(maps, [at(0, 0), at(2, 0), at(0, -1), at(3, 0), at(0, 1)]);
    expect([foliage.top, athel.top, verdant.top]).toEqual([64, 64, 64]);
    expect(sap.bottom).toBe(foliage.top);
    expect(mapTest.top).toBe(foliage.bottom);
    expect(athel.left - foliage.right).toBe(64);
    expect(athel.right).toBe(verdant.left);
    expect(mapsTouch(foliage, athel)).toBe(false);
    // The wide map ends where the gap ends: its corner meets the map beyond the gap.
    expect([mapTest.right, mapTest.top]).toEqual([athel.left, athel.bottom]);
    expect(mapsTouch(mapTest, athel)).toBe(false);
  });

  it('leaves one gap for a run of empty columns or rows, and keeps an island apart', () => {
    const maps = [map('a'), map('b', 32, 16), map('c', 16, 8), map('island')];
    const [a, b, c, island] = mapRects(maps, [at(0, 0), at(2, 0), at(7, 0), at(0, 4)]);
    expect(b.left - a.right).toBe(16);
    expect(c.left - b.right).toBe(16);
    expect(island.top - a.bottom).toBe(8);
    for (const [i, x] of [a, b, c, island].entries())
      for (const y of [a, b, c, island].slice(i + 1)) expect(mapsTouch(x, y)).toBe(false);
  });

  it('meets a diagonal neighbour at one corner only', () => {
    const [a, b] = mapRects([map('a'), map('b')], [at(0, 0), at(1, 1)]);
    expect([b.left, b.top]).toEqual([a.right, a.bottom]);
    expect(mapsTouch(a, b)).toBe(false);
  });

  it('places maps with world origins in their world, the other maps right of them', () => {
    const maps = [
      { ...map('a'), worldX: 0, worldY: 0 },
      { ...map('b'), worldX: 16, worldY: 8 },
      { ...map('c', 8, 16), worldX: 33, worldY: 0 },
      map('loose', 16, 16),
    ];
    const [a, b, c, loose] = mapRects(maps, [at(0, 0), at(1, 0), at(2, 0), at(3, 0)]);
    expect(b).toEqual(rect(16, 8, 32, 24));
    expect(mapsTouch(a, b)).toBe(true);
    expect(mapsTouch(b, c)).toBe(false);
    expect(loose.left - c.right).toBe(8);
    expect(loose.top).toBe(0);
  });

  it('never reads an overlap as a shared edge', () => {
    expect(mapsTouch(rect(0, 0, 16, 16), rect(8, 0, 24, 16))).toBe(false);
    expect(mapsTouch(rect(0, 0, 16, 16), rect(16, 0, 32, 16))).toBe(true);
    expect(mapsTouch(rect(0, 0, 16, 16), rect(17, 0, 33, 16))).toBe(false);
  });

  it('never overlaps, and gives the same places in any map order', () => {
    const maps = [map('a', 8, 40), map('b', 40, 8), map('c'), map('d', 24, 24), map('e', 8, 8), map('f', 64, 16)];
    const cells = [at(0, 0), at(1, 0), at(0, 1), at(2, 1), at(1, 2), at(-1, 2)];
    const rects = mapRects(maps, cells);
    noOverlap(rects);
    expect(mapRects([...maps].reverse(), [...cells].reverse()).reverse()).toEqual(rects);
  });
});

describe('instance map layout', () => {
  it('scales the world to its longest map side and centres it', () => {
    const maps = [map('test-a', 64, 64), map('test-b', 64, 64), map('map-test-b', 128, 50)];
    const { nodes, w, h } = instanceMapLayout(maps, [at(0, 0), at(1, 0), at(0, 1)]);
    expect([w, h]).toEqual([1, 114 / 128]);
    expect(nodes.map(({ w: width, h: height }) => [width, height])).toEqual([
      [0.5, 0.5],
      [0.5, 0.5],
      [1, 50 / 128],
    ]);
    expect(nodes[0].y + nodes[0].h / 2).toBeCloseTo(nodes[2].y - nodes[2].h / 2, 12);
    expect(nodes[0].x - nodes[0].w / 2).toBeCloseTo(-w / 2, 12);
    expect(nodes.every(({ world }) => world === null)).toBe(true);
  });

  it('gives a placed map its world centre at the same scale', () => {
    const { nodes } = instanceMapLayout(
      [{ ...map('a', 16, 8), worldX: 32, worldY: 0 }, map('b', 16, 8)],
      [at(0, 0), at(1, 0)],
    );
    expect(nodes[0].world).toEqual({ x: 40 / 16, y: 4 / 16 });
    expect(nodes[1].world).toBeNull();
  });

  it('sends the same layout to the modal and the world preview', () => {
    const maps = [map('a'), map('b'), map('c', 8, 16)];
    const cells = maps.map(({ code }, x) => ({ mapCode: code, x, y: 0 }));
    const payload = buildStaticPayload({
      instance: { code: 'world', cyberiaMapCodes: maps.map(({ code }) => code), mapLayout: cells },
      maps,
      quests: [],
      actions: [],
      rules: rules(),
    });
    const logical = instanceMapLayout(maps, cells);
    const preview = worldPreviewGeometry(maps, cells);
    const scale = (preview.width - 4) / logical.w;
    payload.nodes.forEach((node, i) => {
      expect(node.position).toEqual({ x: logical.nodes[i].x, y: logical.nodes[i].y });
      expect(
        Math.abs(preview.rects[i].left - 2 - (node.position.x - node.w / 2 + logical.w / 2) * scale),
      ).toBeLessThanOrEqual(1);
    });
    expect(preview.rects[0].joinedTo).toEqual([1]);
    expect(preview.rects[1].joinedTo).toEqual([0, 2]);
    expect(preview.rects[0].left + preview.rects[0].width).toBe(preview.rects[1].left);
  });

  it('handles an empty world', () => {
    expect(instanceMapLayout([], [])).toEqual({ nodes: [], w: 0, h: 0 });
    expect(mapRects([], [])).toEqual([]);
  });
});

describe('instance map payload', () => {
  const world = (portals, quests = [], actions = []) =>
    buildStaticPayload({
      instance: { code: 'world', cyberiaMapCodes: ['a', 'b'], mapLayout: [], portals },
      maps: [map('a'), map('b')],
      quests,
      actions,
      rules: rules(),
    });

  it('drops the target cell of a random portal, as the server does', () => {
    const payload = world([
      { sourceMapCode: 'a', sourceCellX: 1, sourceCellY: 2, targetMapCode: 'b', targetCellX: 3, targetCellY: 4 },
      {
        sourceMapCode: 'a',
        sourceCellX: 5,
        sourceCellY: 6,
        targetMapCode: 'b',
        targetCellX: 7,
        targetCellY: 8,
        portalMode: 'inter-random',
      },
    ]);
    expect(payload.edges.map(({ targetCellX, targetCellY }) => [targetCellX, targetCellY])).toEqual([
      [3, 4],
      [-1, -1],
    ]);
    const cells = payload.presencePois.map(({ mapCode, cellX, cellY }) => `${mapCode}:${cellX}:${cellY}`);
    expect(cells).toContain('b:3:4');
    expect(cells).not.toContain('b:7:8');
  });

  it('names each action with the services it configures, and each quest with its title', () => {
    const payload = world(
      [],
      [{ code: 'q', title: 'First Contact', sourceMapCode: 'a', sourceCellX: 2, sourceCellY: 2 }],
      [
        {
          code: 'vendor',
          label: 'Vendor',
          sourceMapCode: 'a',
          sourceCellX: 2,
          sourceCellY: 2,
          dialogCode: 'greet',
          shopItems: [{ itemId: 'sword' }],
          storageSlots: 8,
          burnItems: ['ore'],
          market: { marketCode: 'm' },
        },
        { code: 'idle', sourceMapCode: 'a', sourceCellX: 9, sourceCellY: 9 },
      ],
    );
    const vendor = payload.presencePois.find(({ cellX }) => 2 === cellX);
    expect(vendor.quests).toEqual([{ code: 'q', title: 'First Contact', prerequisiteCodes: [] }]);
    expect(vendor.actions[0]).toMatchObject({
      code: 'vendor',
      label: 'Vendor',
      standalone: true,
      services: ['shop', 'storage', 'market', 'burn', 'talk'],
    });
    const idle = payload.presencePois.find(({ cellX }) => 9 === cellX);
    expect(idle.actions[0]).toMatchObject({ label: '', standalone: false, services: [] });
  });

  it('resolves the entry spawn as the server does, and names a cell only when it is fixed', () => {
    const spawn = (playerSpawn, maps = [{ ...map('a'), name: 'Alpha' }, map('b', 8, 8)]) =>
      buildStaticPayload({
        instance: { code: 'world', cyberiaMapCodes: ['a', 'b'], mapLayout: [], portals: [], playerSpawn },
        maps,
        quests: [],
        actions: [],
        rules: rules(),
      }).entrySpawn;
    expect(spawn({ sourceMapCode: 'a', sourceCellX: 3, sourceCellY: 4 })).toEqual({
      mode: 'fixed',
      mapCode: 'a',
      mapName: 'Alpha',
      cellX: 3,
      cellY: 4,
    });
    // No cell reads as 0, as the server receives it.
    expect(spawn({ sourceMapCode: 'b' })).toEqual({ mode: 'fixed', mapCode: 'b', mapName: 'b', cellX: 0, cellY: 0 });
    // A random spawn, or one with no map, names no cell.
    expect(spawn({ sourceMapCode: 'a', sourceCellX: 3, sourceCellY: 4, random: true })).toEqual({ mode: 'random' });
    expect(spawn({})).toEqual({ mode: 'random' });
    expect(spawn(undefined)).toEqual({ mode: 'random' });
    // A map out of the world, a map with no document or a cell off the map: the server uses a random cell.
    expect(spawn({ sourceMapCode: 'elsewhere', sourceCellX: 1, sourceCellY: 1 })).toEqual({
      mode: 'unresolved',
      mapCode: 'elsewhere',
      cellX: 1,
      cellY: 1,
    });
    expect(spawn({ sourceMapCode: 'b', sourceCellX: 1, sourceCellY: 1 }, [map('a')]).mode).toBe('unresolved');
    expect(spawn({ sourceMapCode: 'b', sourceCellX: 8, sourceCellY: 0 }).mode).toBe('unresolved');
    expect(spawn({ sourceMapCode: 'b', sourceCellX: -1, sourceCellY: 0 }).mode).toBe('unresolved');
  });

  const entity = (entityType, initCellX, objectLayerItemIds = []) => ({
    entityType,
    initCellX,
    initCellY: 1,
    objectLayerItemIds,
  });

  it('counts the bots and resources each map places, one per entity', () => {
    const payload = buildStaticPayload({
      instance: { code: 'world', cyberiaMapCodes: ['a', 'b'], mapLayout: [], portals: [] },
      maps: [
        {
          ...map('a'),
          entities: [
            entity('bot', 1, ['sword']),
            entity('bot', 1, ['hat']),
            entity('bot', 2),
            entity('resource', 3),
            entity('floor', 4),
            entity('portal', 5),
          ],
        },
        map('b'),
      ],
      quests: [],
      actions: [],
      objectLayerMetadata: { sword: { type: 'weapon' } },
      rules: rules(),
    });
    expect(payload.nodes.map(({ placed }) => placed)).toEqual([
      { hostile: 1, passive: 2, resource: 1 },
      { hostile: 0, passive: 0, resource: 0 },
    ]);
    // Two bots on one cell are one mark: the mark takes the higher class.
    expect(payload.presencePois.find(({ cellX }) => 1 === cellX).presenceStatus).toBe('hostile');
  });

  it('names the skin of each placed bot, whether a player can kill it, and what each cell gives', () => {
    const payload = buildStaticPayload({
      instance: { code: 'world', cyberiaMapCodes: ['a'], mapLayout: [], portals: [] },
      maps: [
        {
          ...map('a'),
          entities: [
            entity('bot', 1, ['wolf-skin', 'claw']),
            entity('bot', 2, ['sage-skin']),
            entity('bot', 3),
            entity('resource', 4, ['oak']),
          ],
        },
      ],
      quests: [],
      actions: [
        {
          code: 'sage',
          sourceMapCode: 'a',
          sourceCellX: 2,
          sourceCellY: 1,
          shopItems: [{ itemId: 'potion' }],
          craftRecipes: [{ outputItems: [{ itemId: 'plank' }, { itemId: 'potion' }] }],
        },
      ],
      objectLayerMetadata: {
        'wolf-skin': { type: 'skin' },
        claw: { type: 'weapon' },
        'sage-skin': { type: 'skin' },
        'ghost-skin': { type: 'skin' },
        oak: { type: 'resource' },
      },
      rules: rules([
        { entityType: 'bot', liveItemIds: ['wolf-skin'], dropItemIds: ['pelt'], behavior: 'hostile' },
        { entityType: 'bot', liveItemIds: ['sage-skin'], dropItemIds: [], behavior: 'provider' },
        { entityType: 'resource', liveItemIds: ['oak'], dropItemIds: ['log'], behavior: '' },
      ]),
    });
    const at = (cellX) => payload.presencePois.find((poi) => cellX === poi.cellX);
    expect(at(1).bots).toEqual([{ skin: 'wolf-skin', mortal: true, stats: 15 }]);
    expect(at(1).yields).toEqual([{ itemId: 'pelt', via: 'drop' }]);
    // A provider is a talk target only; its action sells and assembles what it lists, once each.
    expect(at(2).bots).toEqual([{ skin: 'sage-skin', mortal: false, stats: 15 }]);
    expect(at(2).yields).toEqual([
      { itemId: 'potion', via: 'shop' },
      { itemId: 'plank', via: 'craft' },
      { itemId: 'potion', via: 'craft' },
    ]);
    // A bot placed without a skin wears the one its matched default puts on.
    expect(at(3).bots).toEqual([{ skin: 'wolf-skin', mortal: true, stats: 15 }]);
    expect(at(4)).toMatchObject({
      presenceStatus: 'resource',
      bots: [],
      resources: [{ itemId: 'oak', stats: 15 }],
      yields: [{ itemId: 'log', via: 'drop' }],
    });
  });

  it('names the stat sum each placement spawns with, as the server computes it', () => {
    const stats = (values) => ({
      effect: 0,
      resistance: 0,
      agility: 0,
      range: 0,
      intelligence: 0,
      utility: 0,
      ...values,
    });
    const placed = (cellX, objectLayerItemIds, extra = {}) => ({
      ...entity('bot', cellX, objectLayerItemIds),
      ...extra,
    });
    const solid = 'rgba(255, 0, 0, 1)';
    const world = (conf) =>
      buildStaticPayload({
        instance: { code: 'world', cyberiaMapCodes: ['a'], mapLayout: [], portals: [] },
        maps: [
          {
            ...map('a'),
            entities: [
              placed(1, ['wolf-skin', 'claw'], { color: solid }),
              placed(2, ['wolf-skin'], { color: solid, level: 3 }),
              placed(3, ['wolf-skin', 'fox-skin', 'claw'], { color: solid }),
              placed(4, ['wolf-skin', 'claw'], { color: 'rgba(0, 0, 0, 0)' }),
              placed(5, ['wolf-skin', 'lead'], { color: solid }),
              { ...entity('resource', 6, ['oak']), color: solid },
            ],
          },
        ],
        quests: [],
        actions: [],
        objectLayerMetadata: {
          'wolf-skin': { type: 'skin', stats: stats({ effect: 1, resistance: 18, agility: 10 }) },
          'fox-skin': { type: 'skin', stats: stats({ resistance: 4 }) },
          claw: { type: 'weapon', stats: stats({ effect: 5, agility: -3 }) },
          lead: { type: 'breastplate', stats: stats({ agility: -200 }) },
          fang: { type: 'weapon', stats: stats({ effect: 7 }) },
          oak: { type: 'resource', stats: stats({ resistance: 10 }) },
        },
        rules: rules(
          [
            { entityType: 'bot', liveItemIds: ['wolf-skin', 'fang'], behavior: 'hostile' },
            { entityType: 'resource', liveItemIds: ['oak'], behavior: '' },
          ],
          conf,
        ),
      });
    const payload = world();
    const bot = (cellX, from = payload) => from.presencePois.find((poi) => cellX === poi.cellX).bots[0].stats;
    // The level-1 base (effect 5, resistance 10) plus what the placed layers add.
    expect(bot(1)).toBe(15 + 29 + 2);
    // A placed level raises every base stat by its step.
    expect(bot(2)).toBe(15 + 2 * (2 + 5 + 1 + 10 + 1 + 1) + 29);
    // A solid-colour placement wears what it places, every layer of it: the server seeds no default.
    expect(bot(3)).toBe(15 + 29 + 4 + 2);
    // Without a solid colour the build seeds its layers too, one per type: its fang stays off for the claw.
    expect(bot(4)).toBe(15 + 29 + 2);
    // A world that wears one layer at most keeps the first.
    expect(bot(4, world({ maxActiveLayers: 1 }))).toBe(15 + 29);
    // A stat never falls under its floor: agility stops at -90.
    expect(bot(5)).toBe(15 + 1 + 18 - 90);
    expect(payload.presencePois.find((poi) => 6 === poi.cellX).resources).toEqual([{ itemId: 'oak', stats: 25 }]);
  });

  it('sends only what the overview draws, never a content document', () => {
    const payload = buildStaticPayload({
      instance: { code: 'world', cyberiaMapCodes: ['a'], mapLayout: [], portals: [], playerSpawn: { random: true } },
      maps: [{ ...map('a'), entities: [entity('bot', 2)] }],
      quests: [{ code: 'q', sourceMapCode: 'a', sourceCellX: 2, sourceCellY: 1, steps: [{ id: 's' }], rewards: [] }],
      actions: [{ code: 'v', sourceMapCode: 'a', sourceCellX: 2, sourceCellY: 1, shopItems: [{ itemId: 'sword' }] }],
      rules: rules(),
    });
    const keys = (value) => Object.keys(value).sort();
    expect(keys(payload)).toEqual([
      'description',
      'edges',
      'entrySpawn',
      'instanceCode',
      'name',
      'nodes',
      'presencePois',
      'topologyMode',
    ]);
    expect(keys(payload.nodes[0])).toEqual([
      'gridX',
      'gridY',
      'h',
      'mapCode',
      'name',
      'placed',
      'position',
      'preview',
      'previewUrl',
      'w',
      'world',
      'x',
      'y',
    ]);
    const [poi] = payload.presencePois;
    expect(keys(poi)).toEqual([
      'actions',
      'bots',
      'capabilities',
      'cellX',
      'cellY',
      'mapCode',
      'presenceStatus',
      'quests',
      'resources',
      'yields',
    ]);
    expect(poi.bots).toEqual([]);
    expect(poi.resources).toEqual([]);
    expect(keys(poi.yields[0])).toEqual(['itemId', 'via']);
    expect(keys(poi.quests[0])).toEqual(['code', 'prerequisiteCodes', 'title']);
    expect(keys(poi.actions[0])).toEqual(['code', 'label', 'questCodes', 'services', 'standalone']);
  });
});
