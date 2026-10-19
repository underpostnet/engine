/**
 * The graph layout contract both graph levels share: the map cells of an instance and the world
 * cells of a universe. The engine, Studio and the instance map payload resolve a layout with it.
 */
import { describe, expect, it } from 'vitest';
import {
  LAYOUT_CELL_LIMIT,
  graphLayoutDefect,
  mapSpatialDefect,
  resolveGraphLayout,
} from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { buildStaticPayload } from '../../../src/api/cyberia-instance/cyberia-instance-map.service.js';

const cells = (layout) => layout.map(({ x, y }) => [x, y]);

describe('the default layout', () => {
  it('packs nodes without a saved cell row by row on a square grid, in node order', () => {
    expect(cells(resolveGraphLayout(['a', 'b', 'c', 'd', 'e'], [], 'code'))).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it('keeps every saved cell and gives the other nodes the first free cells', () => {
    const layout = resolveGraphLayout(['a', 'b', 'c'], [{ code: 'b', x: 0, y: 0 }], 'code');
    expect(layout).toEqual([
      { code: 'a', x: 1, y: 0 },
      { code: 'b', x: 0, y: 0 },
      { code: 'c', x: 0, y: 1 },
    ]);
  });

  it('ignores a saved cell of a node the graph does not hold', () => {
    expect(resolveGraphLayout(['a'], [{ code: 'gone', x: 0, y: 0 }], 'code')).toEqual([{ code: 'a', x: 0, y: 0 }]);
  });

  it('gives the same layout for the same input', () => {
    const saved = [{ code: 'c', x: -3, y: 2 }];
    expect(resolveGraphLayout(['a', 'b', 'c'], saved, 'code')).toEqual(
      resolveGraphLayout(['a', 'b', 'c'], saved, 'code'),
    );
  });

  it('keeps cells when a release returns the same node codes in another order', () => {
    const byCode = (layout) => Object.fromEntries(layout.map(({ code, x, y }) => [code, [x, y]]));
    expect(byCode(resolveGraphLayout(['b', 'c', 'a'], [], 'code'))).toEqual(
      byCode(resolveGraphLayout(['a', 'b', 'c'], [], 'code')),
    );
  });
});

describe('a saved layout', () => {
  const codes = ['a', 'b'];
  it('passes with one integer cell per node, in bounds', () => {
    expect(graphLayoutDefect(codes, [{ code: 'a', x: -LAYOUT_CELL_LIMIT, y: LAYOUT_CELL_LIMIT }], 'code')).toBe('');
  });

  it.each([
    [[{ code: 'z', x: 0, y: 0 }], 'z is not a node of the graph'],
    [
      [
        { code: 'a', x: 0, y: 0 },
        { code: 'a', x: 1, y: 0 },
      ],
      'a has two cells',
    ],
    [[{ code: 'a', x: 0.5, y: 0 }], `a needs integer cells within ±${LAYOUT_CELL_LIMIT}`],
    [[{ code: 'a', x: LAYOUT_CELL_LIMIT + 1, y: 0 }], `a needs integer cells within ±${LAYOUT_CELL_LIMIT}`],
    [
      [
        { code: 'a', x: 2, y: 3 },
        { code: 'b', x: 2, y: 3 },
      ],
      'b shares the cell 2,3',
    ],
  ])('fails on %j', (layout, defect) => {
    expect(graphLayoutDefect(codes, layout, 'code')).toBe(defect);
  });
});

describe('the instance map payload', () => {
  const instance = {
    code: 'w',
    cyberiaMapCodes: ['m1', 'm2', 'm3'],
    mapLayout: [{ mapCode: 'm3', x: 5, y: -1 }],
    portals: [{ sourceMapCode: 'm1', sourceCellX: 1, sourceCellY: 2, targetMapCode: 'm3', portalMode: 'inter-random' }],
  };
  // The read order of the maps is not the order of the instance.
  const maps = [
    { code: 'm3', gridX: 8, gridY: 8, entities: [] },
    { code: 'm1', gridX: 8, gridY: 8, entities: [] },
    { code: 'm2', gridX: 8, gridY: 8, entities: [] },
  ];
  // Empty entity defaults keep the payload in memory: no content artifact.
  const payloadOf = (world) => buildStaticPayload({ quests: [], actions: [], entityDefaults: [], ...world });

  it('places each map on its saved or default cell, in the instance order', () => {
    const payload = payloadOf({ instance, maps });
    expect(payload.nodes.map(({ mapCode, x, y }) => [mapCode, x, y])).toEqual([
      ['m1', 0, 0],
      ['m2', 1, 0],
      ['m3', 5, -1],
    ]);
  });

  it('sizes each map by its grid at one scale for the whole world', () => {
    const payload = payloadOf({
      instance,
      maps: [
        { ...maps[0], gridX: 16, gridY: 32 },
        { ...maps[1], gridX: 32, gridY: 16 },
        { ...maps[2], gridX: 0, gridY: 0 },
      ],
    });
    expect(payload.nodes.map(({ mapCode, w, h }) => [mapCode, w, h])).toEqual([
      ['m1', 1, 0.5],
      ['m2', 1, 1],
      ['m3', 0.5, 1],
    ]);
  });

  it('places a map with a world origin at its centre there, at the scale of its size', () => {
    const payload = payloadOf({
      instance,
      maps: [
        { ...maps[0], gridX: 16, gridY: 8, worldX: 32, worldY: 0 },
        { ...maps[1], gridX: 16, gridY: 8, worldX: 16, worldY: 0 },
        maps[2],
      ],
    });
    const [m1, m2, m3] = payload.nodes;
    expect(m1.world).toEqual({ x: (16 + 8) * (m1.w / 16), y: 4 * (m1.h / 8) });
    // Side by side in their world, the two maps are one width apart.
    expect(m3.world.x - m1.world.x).toBeCloseTo(m1.w);
    expect(m3.world.y).toBeCloseTo(m1.world.y);
    expect(m2.world).toBeNull();
  });

  it('takes a world origin of two integer cells, or none', () => {
    expect(mapSpatialDefect({ gridX: 8, gridY: 8 })).toBe('');
    expect(mapSpatialDefect({ gridX: 8, gridY: 8, worldX: null, worldY: null })).toBe('');
    expect(mapSpatialDefect({ gridX: 8, gridY: 8, worldX: -16, worldY: 0 })).toBe('');
    for (const origin of [{ worldX: 1 }, { worldX: 0.5, worldY: 0 }, { worldX: 2e6, worldY: 0 }])
      expect(mapSpatialDefect({ gridX: 8, gridY: 8, ...origin })).toMatch('world origin');
    expect(mapSpatialDefect({ gridX: 0, gridY: 8, worldX: 0, worldY: 0 })).toMatch('positive integer');
  });

  it('keeps the portal edges as authored, whatever the cells', () => {
    const moved = payloadOf({ instance: { ...instance, mapLayout: [] }, maps });
    const saved = payloadOf({ instance, maps });
    expect(saved.edges).toEqual(moved.edges);
    expect(saved.edges).toEqual([
      {
        sourceMapCode: 'm1',
        sourceCellX: 1,
        sourceCellY: 2,
        targetMapCode: 'm3',
        targetCellX: -1,
        targetCellY: -1,
        portalMode: 'inter-random',
      },
    ]);
  });
});
