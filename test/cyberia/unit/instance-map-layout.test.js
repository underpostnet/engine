import { describe, expect, it } from 'vitest';
import { instanceMapLayout, mapRects, mapsTouch } from '../../../src/projects/cyberia/instance/instance-map-layout.js';
import { buildStaticPayload } from '../../../src/api/cyberia-instance/cyberia-instance-map.service.js';
import { worldPreviewGeometry } from '../../../src/projects/cyberia/instance/world-preview.js';

const map = (code, gridX = 16, gridY = 16) => ({ code, gridX, gridY });
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
      entityDefaults: [],
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
